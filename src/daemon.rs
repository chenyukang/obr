use std::{
    collections::BTreeSet,
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    net::SocketAddr,
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, anyhow, bail};
use chrono::Local;

use crate::{app::runtime_data_dir, config::Config};

const PID_FILE: &str = "obr.pid";
const STARTUP_CHECK_DELAY: Duration = Duration::from_millis(300);
const STOP_TIMEOUT: Duration = Duration::from_secs(3);
const STOP_POLL_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum DaemonCommand {
    Start,
    Stop,
    Reload,
    Status,
}

#[derive(Debug, Default)]
struct DaemonDiscovery {
    obr_pids: Vec<u32>,
    other_listeners: Vec<u32>,
}

pub(crate) fn start() -> Result<()> {
    let config = Config::load()?;
    let discovery = discover(&config)?;
    if !discovery.obr_pids.is_empty() {
        write_pid_file(discovery.obr_pids[0])?;
        println!(
            "obr daemon already running pid(s) {} log {}",
            format_pids(&discovery.obr_pids),
            config.log_path.display()
        );
        return Ok(());
    }
    if !discovery.other_listeners.is_empty() {
        bail!(
            "listen address {} is already used by non-obr pid(s) {}",
            config.listen,
            format_pids(&discovery.other_listeners)
        );
    }

    ensure_log_dir(&config)?;
    fs::create_dir_all(runtime_data_dir()?)?;
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&config.log_path)
        .with_context(|| format!("open log file {}", config.log_path.display()))?;
    let stderr = log.try_clone().context("clone daemon log file")?;
    let mut parent_log = log
        .try_clone()
        .context("clone daemon log file for parent")?;

    let mut command = Command::new(std::env::current_exe().context("resolve current executable")?);
    command
        .arg("run")
        .current_dir(std::env::current_dir().context("resolve current directory")?)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(stderr));

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }

    let mut child = command.spawn().context("spawn obr daemon")?;
    write_pid_file(child.id())?;
    thread::sleep(STARTUP_CHECK_DELAY);
    if let Some(status) = child.try_wait().context("check daemon startup status")? {
        remove_pid_file()?;
        bail!("obr daemon exited immediately with {status}");
    }

    writeln!(
        parent_log,
        "{} started obr daemon pid {} listening on {}",
        Local::now().to_rfc3339(),
        child.id(),
        config.listen
    )
    .with_context(|| format!("write daemon log {}", config.log_path.display()))?;
    println!(
        "started obr daemon pid {} log {}",
        child.id(),
        config.log_path.display()
    );
    Ok(())
}

pub(crate) fn stop() -> Result<()> {
    let config = Config::load()?;
    let discovery = discover(&config)?;
    if discovery.obr_pids.is_empty() {
        remove_pid_file()?;
        if discovery.other_listeners.is_empty() {
            println!("obr daemon is not running");
        } else {
            println!(
                "obr daemon is not running; listen address {} is used by non-obr pid(s) {}",
                config.listen,
                format_pids(&discovery.other_listeners)
            );
        }
        return Ok(());
    }

    for pid in &discovery.obr_pids {
        terminate_pid(*pid, Signal::Terminate)?;
    }

    if !wait_until_exited(&discovery.obr_pids, STOP_TIMEOUT) {
        for pid in &discovery.obr_pids {
            if process_alive(*pid) {
                terminate_pid(*pid, Signal::Kill)?;
            }
        }
        let _ = wait_until_exited(&discovery.obr_pids, STOP_TIMEOUT);
    }

    remove_pid_file()?;
    append_daemon_log(
        &config,
        &format!(
            "stopped obr daemon pid(s) {} listening on {}",
            format_pids(&discovery.obr_pids),
            config.listen
        ),
    )?;
    println!(
        "stopped obr daemon pid(s) {}",
        format_pids(&discovery.obr_pids)
    );
    Ok(())
}

pub(crate) fn reload() -> Result<()> {
    stop()?;
    start()
}

pub(crate) fn status() -> Result<()> {
    let config = Config::load()?;
    let discovery = discover(&config)?;
    if discovery.obr_pids.is_empty() {
        if discovery.other_listeners.is_empty() {
            println!("obr daemon is not running");
        } else {
            println!(
                "obr daemon is not running; listen address {} is used by non-obr pid(s) {}",
                config.listen,
                format_pids(&discovery.other_listeners)
            );
        }
    } else {
        println!(
            "obr daemon running pid(s) {} listen {} log {}",
            format_pids(&discovery.obr_pids),
            config.listen,
            config.log_path.display()
        );
    }
    Ok(())
}

fn discover(config: &Config) -> Result<DaemonDiscovery> {
    let listen = listen_addr(config)?;
    let mut obr_pids = BTreeSet::new();
    let mut other_listeners = BTreeSet::new();

    if let Some(pid) = read_pid_file()? {
        if process_alive(pid) && is_obr_process(pid) {
            obr_pids.insert(pid);
        } else if !process_alive(pid) {
            remove_pid_file()?;
        }
    }

    for pid in listening_pids(listen.port())? {
        if is_obr_process(pid) {
            obr_pids.insert(pid);
        } else {
            other_listeners.insert(pid);
        }
    }

    Ok(DaemonDiscovery {
        obr_pids: obr_pids.into_iter().collect(),
        other_listeners: other_listeners.into_iter().collect(),
    })
}

fn listen_addr(config: &Config) -> Result<SocketAddr> {
    config
        .listen
        .parse()
        .with_context(|| format!("invalid listen address `{}`", config.listen))
}

fn ensure_log_dir(config: &Config) -> Result<()> {
    if let Some(parent) = config.log_path.parent()
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(parent)
            .with_context(|| format!("create log directory {}", parent.display()))?;
    }
    Ok(())
}

fn append_daemon_log(config: &Config, message: &str) -> Result<()> {
    ensure_log_dir(config)?;
    let mut log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&config.log_path)
        .with_context(|| format!("open log file {}", config.log_path.display()))?;
    writeln!(log, "{} {message}", Local::now().to_rfc3339())
        .with_context(|| format!("write daemon log {}", config.log_path.display()))
}

fn pid_file_path() -> Result<std::path::PathBuf> {
    Ok(runtime_data_dir()?.join(PID_FILE))
}

fn write_pid_file(pid: u32) -> Result<()> {
    fs::create_dir_all(runtime_data_dir()?)?;
    fs::write(pid_file_path()?, format!("{pid}\n")).context("write daemon pid file")
}

fn read_pid_file() -> Result<Option<u32>> {
    let path = pid_file_path()?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err).with_context(|| format!("read pid file {}", path.display())),
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    match trimmed.parse::<u32>() {
        Ok(pid) => Ok(Some(pid)),
        Err(_) => Ok(None),
    }
}

fn remove_pid_file() -> Result<()> {
    match fs::remove_file(pid_file_path()?) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err).context("remove daemon pid file"),
    }
}

fn listening_pids(port: u16) -> Result<Vec<u32>> {
    let output = match Command::new("lsof")
        .arg("-nP")
        .arg("-t")
        .arg(format!("-iTCP:{port}"))
        .arg("-sTCP:LISTEN")
        .output()
    {
        Ok(output) => output,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err).context("run lsof"),
    };

    if !output.status.success() && output.stdout.is_empty() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect())
}

fn is_obr_process(pid: u32) -> bool {
    process_command(pid)
        .as_deref()
        .map(command_basename_is_obr)
        .unwrap_or(false)
}

fn command_basename_is_obr(command: &str) -> bool {
    command
        .split_whitespace()
        .next()
        .and_then(|binary| Path::new(binary).file_name())
        .and_then(|name| name.to_str())
        == Some("obr")
}

fn process_command(pid: u32) -> Option<String> {
    let output = Command::new("ps")
        .arg("-p")
        .arg(pid.to_string())
        .arg("-o")
        .arg("command=")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let command = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if command.is_empty() {
        None
    } else {
        Some(command)
    }
}

#[derive(Clone, Copy)]
enum Signal {
    Terminate,
    Kill,
}

#[cfg(unix)]
fn terminate_pid(pid: u32, signal: Signal) -> Result<()> {
    let signal = match signal {
        Signal::Terminate => libc::SIGTERM,
        Signal::Kill => libc::SIGKILL,
    };
    let result = unsafe { libc::kill(pid as libc::pid_t, signal) };
    if result == 0 {
        Ok(())
    } else {
        let err = std::io::Error::last_os_error();
        if err.raw_os_error() == Some(libc::ESRCH) {
            Ok(())
        } else {
            Err(anyhow!("signal pid {pid}: {err}"))
        }
    }
}

#[cfg(not(unix))]
fn terminate_pid(_pid: u32, _signal: Signal) -> Result<()> {
    bail!("daemon stop is currently supported on Unix-like systems only")
}

#[cfg(unix)]
fn process_alive(pid: u32) -> bool {
    let result = unsafe { libc::kill(pid as libc::pid_t, 0) };
    if result == 0 {
        return true;
    }
    std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
}

#[cfg(not(unix))]
fn process_alive(pid: u32) -> bool {
    process_command(pid).is_some()
}

fn wait_until_exited(pids: &[u32], timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if pids.iter().all(|pid| !process_alive(*pid)) {
            return true;
        }
        thread::sleep(STOP_POLL_INTERVAL);
    }
    pids.iter().all(|pid| !process_alive(*pid))
}

fn format_pids(pids: &[u32]) -> String {
    pids.iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",")
}

#[cfg(test)]
mod tests {
    use super::command_basename_is_obr;

    #[test]
    fn command_basename_matches_obr_binary() {
        assert!(command_basename_is_obr("/tmp/obr run"));
        assert!(command_basename_is_obr("obr run"));
        assert!(!command_basename_is_obr("/tmp/not-obr run"));
    }
}
