use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

use anyhow::{Result, bail};

use crate::{app::runtime_data_dir, config::Config};

pub(crate) fn run() -> Result<()> {
    let mut doctor = Doctor::default();
    let config = match Config::load() {
        Ok(config) => {
            doctor.ok("config loaded");
            config
        }
        Err(err) => {
            doctor.error(format!("config failed: {err}"));
            return doctor.finish();
        }
    };
    let data_dir = runtime_data_dir()?;

    doctor.check_dir_exists("vault", &config.vault_path);
    doctor.check_dir_writable("data", &data_dir);
    doctor.check_dir_writable(
        "image directory",
        &config.vault_path.join(&config.image_dir),
    );
    if let Some(parent) = config.log_path.parent()
        && !parent.as_os_str().is_empty()
    {
        doctor.check_dir_writable("log directory", parent);
    }
    if let Some(parent) = config.passkey_store_path.parent()
        && !parent.as_os_str().is_empty()
    {
        doctor.check_dir_writable("passkey store directory", parent);
    }
    doctor.check_webauthn(&config);
    doctor.finish()
}

#[derive(Default)]
struct Doctor {
    errors: usize,
    warnings: usize,
}

impl Doctor {
    fn ok(&self, message: impl AsRef<str>) {
        println!("[ok] {}", message.as_ref());
    }

    fn warn(&mut self, message: impl AsRef<str>) {
        self.warnings += 1;
        println!("[warn] {}", message.as_ref());
    }

    fn error(&mut self, message: impl AsRef<str>) {
        self.errors += 1;
        println!("[error] {}", message.as_ref());
    }

    fn check_dir_exists(&mut self, label: &str, path: &Path) {
        if path.is_dir() {
            self.ok(format!("{label} exists: {}", path.display()));
        } else {
            self.error(format!("{label} is not a directory: {}", path.display()));
        }
    }

    fn check_dir_writable(&mut self, label: &str, path: &Path) {
        if let Err(err) = fs::create_dir_all(path) {
            self.error(format!("create {label} {}: {err}", path.display()));
            return;
        }
        let probe = path.join(format!(".obr-doctor-{}", std::process::id()));
        match OpenOptions::new().write(true).create_new(true).open(&probe) {
            Ok(mut file) => {
                if let Err(err) = file.write_all(b"ok") {
                    self.error(format!("write {label} {}: {err}", path.display()));
                } else {
                    self.ok(format!("{label} writable: {}", path.display()));
                }
            }
            Err(err) => self.error(format!("{label} not writable {}: {err}", path.display())),
        }
        let _ = fs::remove_file(probe);
    }

    fn check_webauthn(&mut self, config: &Config) {
        let origin = match config.webauthn_origin() {
            Ok(origin) => origin,
            Err(err) => {
                self.error(format!("webauthn_origin invalid: {err}"));
                return;
            }
        };
        let rp_id = match config.webauthn_rp_id() {
            Ok(rp_id) => rp_id,
            Err(err) => {
                self.error(format!("webauthn_rp_id invalid: {err}"));
                return;
            }
        };
        let Some(host) = origin.host_str() else {
            self.error("webauthn_origin must include a host");
            return;
        };
        if !rp_id_matches_origin_host(&rp_id, host) {
            self.error(format!(
                "webauthn_rp_id `{rp_id}` does not match origin host `{host}`"
            ));
        } else {
            self.ok("webauthn RP ID matches origin host");
        }

        let origin_is_loopback = host.eq_ignore_ascii_case("localhost")
            || host
                .parse::<std::net::IpAddr>()
                .map(|ip| ip.is_loopback())
                .unwrap_or(false);
        if origin.scheme() != "https" && !origin_is_loopback {
            self.error("remote webauthn_origin must use HTTPS");
        }
        if origin.scheme() == "https" && !origin_is_loopback && !config.secure_cookies {
            self.error("secure_cookies must be true for HTTPS remote access");
        }
        if !config.is_loopback_listen() && !config.secure_cookies {
            self.warn("listening on a non-loopback address with secure_cookies = false");
        }
    }

    fn finish(&self) -> Result<()> {
        if self.errors == 0 {
            println!(
                "doctor passed with {} warning{}",
                self.warnings,
                if self.warnings == 1 { "" } else { "s" }
            );
            Ok(())
        } else {
            bail!(
                "doctor found {} error{} and {} warning{}",
                self.errors,
                if self.errors == 1 { "" } else { "s" },
                self.warnings,
                if self.warnings == 1 { "" } else { "s" }
            )
        }
    }
}

fn rp_id_matches_origin_host(rp_id: &str, host: &str) -> bool {
    let rp_id = rp_id.trim_end_matches('.').to_ascii_lowercase();
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    host == rp_id || host.ends_with(&format!(".{rp_id}"))
}

#[cfg(test)]
mod tests {
    use super::rp_id_matches_origin_host;

    #[test]
    fn rp_id_can_be_parent_domain_of_origin_host() {
        assert!(rp_id_matches_origin_host("example.com", "obr.example.com"));
        assert!(!rp_id_matches_origin_host("example.com", "badexample.com"));
    }
}
