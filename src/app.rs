use std::{
    fs::{self, OpenOptions},
    io::Write,
    net::SocketAddr,
    process::{Command, Stdio},
    sync::Arc,
};

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
use chrono::Local;
use tokio::net::TcpListener;
use tower_http::{
    services::ServeDir,
    trace::{DefaultOnRequest, DefaultOnResponse, TraceLayer},
};
use tower_sessions::{MemoryStore, Session, SessionManagerLayer};
use tracing::{Level, info, warn};
use tracing_subscriber::{EnvFilter, fmt::time::LocalTime};
use webauthn_rs::prelude::{Webauthn, WebauthnBuilder};

use crate::{
    auth::{LoginLimiter, is_authenticated, print_password_hash_from_stdin, session_layer},
    config::Config,
    passkeys::PasskeyStore,
    routes,
};

pub(crate) struct AppState {
    pub(crate) config: Config,
    pub(crate) login_limiter: LoginLimiter,
    pub(crate) webauthn: Arc<Webauthn>,
    pub(crate) passkey_store: Arc<PasskeyStore>,
}

const MAX_JSON_BODY_BYTES: usize = 8 * 1024 * 1024;
const CONTENT_SECURITY_POLICY_VALUE: &str = concat!(
    "default-src 'self'; ",
    "script-src 'self'; ",
    "style-src 'self'; ",
    "img-src 'self' data:; ",
    "connect-src 'self'; ",
    "object-src 'none'; ",
    "base-uri 'none'; ",
    "frame-ancestors 'none'; ",
    "form-action 'self'"
);

pub fn run() -> Result<()> {
    match std::env::args().nth(1).as_deref() {
        Some("hash-password") => {
            print_password_hash_from_stdin()?;
            return Ok(());
        }
        Some("daemon") | Some("--daemon") => {
            start_daemon()?;
            return Ok(());
        }
        Some("run") | None => {}
        Some(command) => bail!("unknown command: {command}"),
    }

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("build tokio runtime")?
        .block_on(serve())
}

async fn serve() -> Result<()> {
    let config = Config::load()?;
    init_logging(&config)?;
    prepare_vault(&config)?;
    let webauthn = build_webauthn(&config)?;
    let passkey_store = PasskeyStore::load(config.passkey_store_path.clone())?;

    let listen: SocketAddr = config.listen.parse().context("invalid listen address")?;
    let session_layer = session_layer(&config);
    let state = Arc::new(AppState {
        config,
        login_limiter: LoginLimiter::default(),
        webauthn,
        passkey_store: Arc::new(passkey_store),
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
        format!("obr={configured},tower_http={configured}")
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

fn start_daemon() -> Result<()> {
    let config = Config::load()?;
    if let Some(parent) = config.log_path.parent()
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(parent)
            .with_context(|| format!("create log directory {}", parent.display()))?;
    }
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

    let child = command.spawn().context("spawn obr daemon")?;
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

fn prepare_vault(config: &Config) -> Result<()> {
    fs::create_dir_all(config.vault_path.join("Daily"))?;
    fs::create_dir_all(config.vault_path.join("Pics"))?;
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
        .nest_service("/assets", ServeDir::new("assets"));

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
        .route("/api/page/source", get(routes::get_page_source))
        .route("/api/page", get(routes::get_page).post(routes::post_page))
        .route("/api/search", get(routes::search))
        .route("/api/entry", post(routes::post_entry))
        .route("/api/mark", post(routes::mark_todo))
        .route("/assets/images/{*path}", get(routes::image))
        .route_layer(middleware::from_fn(require_auth));

    public
        .merge(protected)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &Request<Body>| {
                    let remote_addr = request
                        .extensions()
                        .get::<ConnectInfo<SocketAddr>>()
                        .map(|ConnectInfo(addr)| addr.to_string())
                        .unwrap_or_else(|| "-".to_string());
                    let user_agent = request
                        .headers()
                        .get(USER_AGENT)
                        .and_then(|value| value.to_str().ok())
                        .unwrap_or("-");
                    let client = classify_user_agent(user_agent);

                    tracing::info_span!(
                        "request",
                        method = %request.method(),
                        uri = %request.uri(),
                        version = ?request.version(),
                        remote_addr = %remote_addr,
                        client = %client,
                        user_agent = %user_agent,
                    )
                })
                .on_request(DefaultOnRequest::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .layer(middleware::from_fn(security_headers))
        .layer(DefaultBodyLimit::max(MAX_JSON_BODY_BYTES))
        .layer(session_layer)
        .with_state(state)
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
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    headers.insert(REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    headers.insert(
        CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(CONTENT_SECURITY_POLICY_VALUE),
    );
    response
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
