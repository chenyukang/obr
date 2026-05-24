use std::{fs, net::SocketAddr, process::Command, sync::Arc, time::Instant};

use anyhow::{Context, Result, bail};
use axum::{
    Router,
    body::Body,
    extract::{ConnectInfo, DefaultBodyLimit},
    http::{
        HeaderValue, Request, StatusCode,
        header::{CONTENT_SECURITY_POLICY, REFERRER_POLICY, USER_AGENT, X_CONTENT_TYPE_OPTIONS},
    },
    middleware::{self, Next},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use tokio::net::TcpListener;
use tower_sessions::{MemoryStore, Session, SessionManagerLayer};
use tracing::{info, warn};
use tracing_subscriber::{EnvFilter, fmt::time::LocalTime};
use webauthn_rs::prelude::{Webauthn, WebauthnBuilder};

use crate::{
    auth::{LoginLimiter, is_authenticated, print_password_hash, session_layer},
    config::Config,
    daemon::{self, DaemonCommand},
    doctor,
    markdown::MarkdownIndex,
    origin,
    passkeys::PasskeyStore,
    routes,
};

#[derive(Debug, PartialEq, Eq)]
enum CommandMode {
    Run,
    HashPassword,
    Doctor,
    Daemon(DaemonCommand),
}

pub(crate) struct AppState {
    pub(crate) config: Config,
    pub(crate) data_dir: std::path::PathBuf,
    pub(crate) login_limiter: LoginLimiter,
    pub(crate) webauthn: Arc<Webauthn>,
    pub(crate) passkey_store: Arc<PasskeyStore>,
    pub(crate) markdown_index: Arc<MarkdownIndex>,
}

const MAX_JSON_BODY_BYTES: usize = 8 * 1024 * 1024;
const DATA_DIR: &str = "data";
const CONTENT_SECURITY_POLICY_VALUE: &str = concat!(
    "default-src 'self'; ",
    "script-src 'self'; ",
    "style-src 'self'; ",
    "img-src 'self' data:; ",
    "connect-src 'self'; ",
    "frame-src 'self'; ",
    "object-src 'self'; ",
    "base-uri 'none'; ",
    "frame-ancestors 'self'; ",
    "form-action 'self'"
);

pub fn run() -> Result<()> {
    match parse_command(std::env::args().skip(1))? {
        CommandMode::HashPassword => {
            print_password_hash()?;
            return Ok(());
        }
        CommandMode::Daemon(DaemonCommand::Start) => {
            daemon::start()?;
            return Ok(());
        }
        CommandMode::Daemon(DaemonCommand::Stop) => {
            daemon::stop()?;
            return Ok(());
        }
        CommandMode::Daemon(DaemonCommand::Reload) => {
            daemon::reload()?;
            return Ok(());
        }
        CommandMode::Daemon(DaemonCommand::Status) => {
            daemon::status()?;
            return Ok(());
        }
        CommandMode::Doctor => {
            doctor::run()?;
            return Ok(());
        }
        CommandMode::Run => {}
    }

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("build tokio runtime")?
        .block_on(serve())
}

fn parse_command(args: impl IntoIterator<Item = String>) -> Result<CommandMode> {
    let mut args = args.into_iter();
    let command = args.next();
    match command.as_deref() {
        None | Some("run") => {
            reject_extra_args(args)?;
            Ok(CommandMode::Run)
        }
        Some("hash-password") => {
            reject_extra_args(args)?;
            Ok(CommandMode::HashPassword)
        }
        Some("doctor") | Some("check") => {
            reject_extra_args(args)?;
            Ok(CommandMode::Doctor)
        }
        Some("daemon") | Some("--daemon") => {
            let subcommand = args.next();
            let daemon_command = match subcommand.as_deref().unwrap_or("start") {
                "start" => DaemonCommand::Start,
                "stop" => DaemonCommand::Stop,
                "reload" | "restart" => DaemonCommand::Reload,
                "status" => DaemonCommand::Status,
                other => bail!(
                    "unknown daemon command `{other}`; expected start, stop, reload, restart, or status"
                ),
            };
            reject_extra_args(args)?;
            Ok(CommandMode::Daemon(daemon_command))
        }
        Some(command) => bail!("unknown command: {command}"),
    }
}

fn reject_extra_args(mut args: impl Iterator<Item = String>) -> Result<()> {
    if let Some(arg) = args.next() {
        bail!("unexpected argument: {arg}");
    }
    Ok(())
}

async fn serve() -> Result<()> {
    let config = Config::load()?;
    init_logging(&config)?;
    let data_dir = runtime_data_dir()?;
    prepare_vault(&config, &data_dir)?;
    let markdown_index = MarkdownIndex::load(config.vault_path.clone())?;
    let index_stats = markdown_index.stats();
    info!(
        files = index_stats.files,
        content_bytes = index_stats.content_bytes,
        "loaded markdown index"
    );
    let webauthn = build_webauthn(&config)?;
    let passkey_store = PasskeyStore::load(config.passkey_store_path.clone())?;

    let listen: SocketAddr = config.listen.parse().context("invalid listen address")?;
    let session_layer = session_layer(&config);
    let state = Arc::new(AppState {
        config,
        data_dir,
        login_limiter: LoginLimiter::default(),
        webauthn,
        passkey_store: Arc::new(passkey_store),
        markdown_index: Arc::new(markdown_index),
    });
    let app = router(Arc::clone(&state), session_layer);

    let listener = TcpListener::bind(listen).await?;
    info!("listening on http://{listen}");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}

fn init_logging(config: &Config) -> Result<()> {
    let filter = log_filter(config);
    let env_filter =
        EnvFilter::try_new(&filter).with_context(|| format!("invalid log filter `{filter}`"))?;
    tracing_subscriber::fmt()
        .with_timer(LocalTime::rfc_3339())
        .with_env_filter(env_filter)
        .try_init()
        .map_err(|err| anyhow::anyhow!("initialize tracing subscriber: {err}"))?;
    Ok(())
}

fn log_filter(config: &Config) -> String {
    let configured = config.log_level.trim();
    if configured.contains('=') || configured.contains(',') {
        configured.to_string()
    } else {
        format!("obr={configured}")
    }
}

fn classify_user_agent(user_agent: &str) -> &'static str {
    if user_agent.contains("Codex/") {
        "codex-in-app-browser"
    } else if user_agent.contains("Mobile") && user_agent.contains("Chrome/") {
        "mobile-chrome"
    } else if user_agent.contains("Chrome/") {
        "chrome"
    } else if user_agent.contains("Mobile") && user_agent.contains("Safari/") {
        "mobile-safari"
    } else if user_agent.contains("curl/") {
        "curl"
    } else if user_agent == "-" {
        "unknown"
    } else {
        "browser-or-client"
    }
}

pub(crate) fn runtime_data_dir() -> Result<std::path::PathBuf> {
    Ok(std::env::current_dir()?.join(DATA_DIR))
}

fn prepare_vault(config: &Config, data_dir: &std::path::Path) -> Result<()> {
    fs::create_dir_all(data_dir)?;
    fs::create_dir_all(config.vault_path.join(&config.daily_dir))?;
    fs::create_dir_all(config.vault_path.join(&config.entry_dir))?;
    fs::create_dir_all(config.vault_path.join(&config.image_dir))?;
    if let Some(parent) = config.todo_path.parent()
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(config.vault_path.join(parent))?;
    }
    Ok(())
}

fn build_webauthn(config: &Config) -> Result<Arc<Webauthn>> {
    let rp_id = config.webauthn_rp_id()?;
    let rp_origin = config.webauthn_origin()?;
    let builder = WebauthnBuilder::new(&rp_id, &rp_origin)
        .with_context(|| format!("configure passkey rp_id={rp_id} origin={rp_origin}"))?
        .rp_name(&config.webauthn_rp_name);
    Ok(Arc::new(builder.build().context("build webauthn")?))
}

fn router(state: Arc<AppState>, session_layer: SessionManagerLayer<MemoryStore>) -> Router {
    let public = Router::new()
        .route("/", get(routes::index))
        .route("/obweb", get(routes::index))
        .route("/front", get(routes::index))
        .route("/front/", get(routes::index))
        .route("/front/index.html", get(routes::index))
        .route("/sw.js", get(routes::service_worker))
        .route("/manifest.webmanifest", get(routes::manifest))
        .route("/api/ping", get(routes::ping))
        .route(
            "/index/front.html",
            get(|| async { Redirect::permanent("/") }),
        )
        .route("/api/login", post(routes::login))
        .route("/api/auth/options", get(routes::auth_options))
        .route(
            "/api/passkey/login/start",
            post(routes::passkey_login_start),
        )
        .route(
            "/api/passkey/login/finish",
            post(routes::passkey_login_finish),
        )
        .route("/api/passkey/available", get(routes::passkey_available))
        .route("/assets/{*path}", get(routes::asset));

    let protected = Router::new()
        .route(
            "/api/passkey/register/start",
            post(routes::passkey_register_start),
        )
        .route(
            "/api/passkey/register/finish",
            post(routes::passkey_register_finish),
        )
        .route("/api/passkey/status", get(routes::passkey_status))
        .route("/api/logout", post(routes::logout))
        .route("/api/verify", get(routes::verify))
        .route("/api/app/config", get(routes::app_config))
        .route("/api/page/source", get(routes::get_page_source))
        .route("/api/page", get(routes::get_page).post(routes::post_page))
        .route("/api/markdown/blocks", post(routes::render_markdown_blocks))
        .route("/api/search", get(routes::search))
        .route("/api/entry", post(routes::post_entry))
        .route("/api/entry/multipart", post(routes::post_entry_multipart))
        .route("/api/mark", post(routes::mark_todo))
        .route("/image-preview/{*path}", get(routes::image_preview))
        .route("/images/{*path}", get(routes::image))
        .route_layer(middleware::from_fn(require_auth));

    public
        .merge(protected)
        .layer(middleware::from_fn(log_request))
        .layer(middleware::from_fn(security_headers))
        .layer(middleware::from_fn_with_state(
            Arc::clone(&state),
            origin::guard,
        ))
        .layer(DefaultBodyLimit::max(MAX_JSON_BODY_BYTES))
        .layer(session_layer)
        .with_state(state)
}

async fn log_request(request: Request<Body>, next: Next) -> Response {
    let started = Instant::now();
    let method = request.method().clone();
    let uri = request.uri().clone();
    let version = request.version();
    let remote_addr = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ConnectInfo(addr)| addr.to_string())
        .unwrap_or_else(|| "-".to_string());
    let user_agent = request
        .headers()
        .get(USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("-")
        .to_string();
    let client = classify_user_agent(&user_agent);

    let response = next.run(request).await;
    let status = response.status();
    let elapsed_ms = started.elapsed().as_millis();

    info!(
        method = %method,
        uri = %uri,
        version = ?version,
        remote_addr = %remote_addr,
        client = %client,
        user_agent = %user_agent,
        status = %status,
        elapsed_ms,
        "request"
    );
    response
}

async fn require_auth(session: Session, request: Request<Body>, next: Next) -> Response {
    match is_authenticated(&session).await {
        Ok(true) => next.run(request).await,
        Ok(false) => StatusCode::UNAUTHORIZED.into_response(),
        Err(err) => {
            warn!("session auth check failed: {err}");
            StatusCode::UNAUTHORIZED.into_response()
        }
    }
}

async fn security_headers(request: Request<Body>, next: Next) -> Response {
    let path = request.uri().path().to_string();
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    headers.insert(REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    if !is_pdf_attachment_path(&path) {
        headers.insert(
            CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(CONTENT_SECURITY_POLICY_VALUE),
        );
    }
    response
}

fn is_pdf_attachment_path(path: &str) -> bool {
    path.starts_with("/images/") && path.to_ascii_lowercase().ends_with(".pdf")
}

impl AppState {
    pub(crate) fn login_limiter_key(&self, username: &str) -> String {
        if username == self.config.username {
            "configured-user".to_string()
        } else {
            "unknown-user".to_string()
        }
    }

    pub(crate) fn maybe_git_pull(&self) {
        if !self.config.auto_git_sync {
            return;
        }
        if let Err(err) = Command::new("git")
            .arg("pull")
            .current_dir(&self.config.vault_path)
            .status()
        {
            warn!("git pull failed to start: {err}");
        }
    }

    pub(crate) fn maybe_git_sync(&self) {
        if !self.config.auto_git_sync {
            return;
        }
        let commands: &[&[&str]] = &[&["add", "."], &["commit", "-m", "update"], &["push"]];
        for args in commands {
            match Command::new("git")
                .args(*args)
                .current_dir(&self.config.vault_path)
                .status()
            {
                Ok(status) if status.success() => {}
                Ok(status) => warn!("git {:?} exited with {status}", args),
                Err(err) => warn!("git {:?} failed to start: {err}", args),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{CommandMode, DaemonCommand, parse_command};

    fn parse(args: &[&str]) -> anyhow::Result<CommandMode> {
        parse_command(args.iter().map(|arg| (*arg).to_string()))
    }

    #[test]
    fn parse_default_command_runs_foreground_server() {
        assert_eq!(parse(&[]).unwrap(), CommandMode::Run);
        assert_eq!(parse(&["run"]).unwrap(), CommandMode::Run);
    }

    #[test]
    fn parse_daemon_commands() {
        assert_eq!(
            parse(&["daemon"]).unwrap(),
            CommandMode::Daemon(DaemonCommand::Start)
        );
        assert_eq!(
            parse(&["daemon", "start"]).unwrap(),
            CommandMode::Daemon(DaemonCommand::Start)
        );
        assert_eq!(
            parse(&["daemon", "stop"]).unwrap(),
            CommandMode::Daemon(DaemonCommand::Stop)
        );
        assert_eq!(
            parse(&["daemon", "reload"]).unwrap(),
            CommandMode::Daemon(DaemonCommand::Reload)
        );
        assert_eq!(
            parse(&["daemon", "restart"]).unwrap(),
            CommandMode::Daemon(DaemonCommand::Reload)
        );
        assert_eq!(
            parse(&["daemon", "status"]).unwrap(),
            CommandMode::Daemon(DaemonCommand::Status)
        );
    }

    #[test]
    fn parse_rejects_unknown_daemon_subcommand() {
        let err = parse(&["daemon", "nope"]).unwrap_err().to_string();
        assert!(err.contains("unknown daemon command"));
    }

    #[test]
    fn parse_rejects_extra_arguments() {
        let err = parse(&["daemon", "stop", "now"]).unwrap_err().to_string();
        assert!(err.contains("unexpected argument"));
    }
}
