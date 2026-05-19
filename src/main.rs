use std::{
    fs,
    io::{self, Read},
    net::SocketAddr,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::Arc,
};

use anyhow::{Context, Result, anyhow, bail};
use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::Local;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use tokio::net::TcpListener;
use tower_http::{services::ServeDir, trace::TraceLayer};
use tower_sessions::{
    Expiry, MemoryStore, Session, SessionManagerLayer,
    cookie::{SameSite, time::Duration as CookieDuration},
};
use tracing::{error, info, warn};
use walkdir::{DirEntry, WalkDir};

#[derive(Clone)]
struct AppState {
    config: Config,
}

#[derive(Clone, Deserialize)]
struct Config {
    listen: String,
    vault_path: PathBuf,
    username: String,
    #[serde(default)]
    password_hash: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default = "default_session_days")]
    session_days: u64,
    #[serde(default)]
    secure_cookies: bool,
    #[serde(default)]
    auto_git_sync: bool,
}

const AUTH_SESSION_KEY: &str = "authenticated";
const DEFAULT_SESSION_DAYS: u64 = 21;

fn default_session_days() -> u64 {
    DEFAULT_SESSION_DAYS
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Deserialize)]
struct PageQuery {
    path: Option<String>,
    query_type: Option<String>,
}

#[derive(Deserialize)]
struct SearchQuery {
    keyword: Option<String>,
}

#[derive(Deserialize)]
struct PageUpdate {
    file: String,
    content: String,
}

#[derive(Deserialize)]
struct EntryRequest {
    page: String,
    links: String,
    text: String,
    image: String,
}

#[derive(Deserialize)]
struct MarkQuery {
    index: Option<usize>,
}

#[derive(Serialize)]
struct ConfigResponse {
    rss_enabled: bool,
}

#[derive(Debug)]
struct AppError {
    status: StatusCode,
    message: &'static str,
    source: Option<anyhow::Error>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if let Some(source) = self.source {
            error!("{:#}", source);
        }
        (self.status, self.message).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        Self::internal(err)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::internal(err)
    }
}

impl From<walkdir::Error> for AppError {
    fn from(err: walkdir::Error) -> Self {
        Self::internal(err)
    }
}

impl From<axum::http::header::InvalidHeaderValue> for AppError {
    fn from(err: axum::http::header::InvalidHeaderValue) -> Self {
        Self::internal(err)
    }
}

impl From<tower_sessions::session::Error> for AppError {
    fn from(err: tower_sessions::session::Error) -> Self {
        Self::internal(err)
    }
}

impl AppError {
    fn internal(err: impl Into<anyhow::Error>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: "internal server error",
            source: Some(err.into()),
        }
    }

    fn unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: "unauthorized",
            source: None,
        }
    }
}

type AppResult<T> = std::result::Result<T, AppError>;

#[tokio::main]
async fn main() -> Result<()> {
    if std::env::args().nth(1).as_deref() == Some("hash-password") {
        print_password_hash_from_stdin()?;
        return Ok(());
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "obr=info,tower_http=info".to_string()),
        )
        .init();

    let config = Config::load()?;
    fs::create_dir_all(config.vault_path.join("Daily"))?;
    fs::create_dir_all(config.vault_path.join("Pics"))?;

    let listen: SocketAddr = config.listen.parse().context("invalid listen address")?;
    let session_layer = session_layer(&config);
    let state = AppState { config };

    let app = Router::new()
        .route("/", get(index))
        .route("/obweb", get(index))
        .route("/api/config", get(api_config))
        .route("/api/login", post(login))
        .route("/api/logout", post(logout))
        .route("/api/verify", get(verify))
        .route("/api/page", get(get_page).post(post_page))
        .route("/api/search", get(search))
        .route("/api/entry", post(post_entry))
        .route("/api/mark", post(mark_todo))
        .route("/api/rss", get(rss_stub))
        .route("/api/rss_mark", post(rss_mark_stub))
        .nest_service(
            "/static/images",
            ServeDir::new(state.config.vault_path.join("Pics")),
        )
        .nest_service("/assets", ServeDir::new("static"))
        .layer(TraceLayer::new_for_http())
        .layer(session_layer)
        .with_state(Arc::new(state));

    let listener = TcpListener::bind(listen).await?;
    info!("listening on http://{listen}");
    axum::serve(listener, app).await?;
    Ok(())
}

impl Config {
    fn load() -> Result<Self> {
        let path = if Path::new("config/local.toml").exists() {
            Path::new("config/local.toml")
        } else {
            Path::new("config.example.toml")
        };
        let raw = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let mut config: Config =
            toml::from_str(&raw).with_context(|| format!("parse {}", path.display()))?;
        if config.vault_path.is_relative() {
            config.vault_path = std::env::current_dir()?.join(config.vault_path);
        }
        config.vault_path = config.vault_path.canonicalize().with_context(|| {
            format!(
                "vault path does not exist or cannot be resolved: {}",
                config.vault_path.display()
            )
        })?;
        config.validate_auth_config()?;
        Ok(config)
    }

    fn validate_auth_config(&self) -> Result<()> {
        if self.username.trim().is_empty() {
            bail!("username cannot be empty");
        }
        if self.session_days == 0 {
            bail!("session_days must be greater than 0");
        }
        match (&self.password_hash, &self.password) {
            (Some(hash), _) => {
                PasswordHash::new(hash)
                    .map_err(|err| anyhow!("invalid password_hash in config: {err}"))?;
                if self.password.is_some() {
                    warn!("both password_hash and password are configured; password is ignored");
                }
            }
            (None, Some(_)) => {
                warn!(
                    "config uses plaintext password; pipe the password into `./target/release/obr hash-password` and set password_hash instead"
                );
            }
            (None, None) => {
                bail!("configure password_hash, or password as a legacy fallback");
            }
        }
        if !self.secure_cookies && !self.is_loopback_listen() {
            warn!("secure_cookies is disabled; enable it when serving Obr over HTTPS");
        }
        Ok(())
    }

    fn session_duration(&self) -> CookieDuration {
        CookieDuration::days(self.session_days.min(i64::MAX as u64) as i64)
    }

    fn is_loopback_listen(&self) -> bool {
        self.listen
            .parse::<SocketAddr>()
            .map(|addr| addr.ip().is_loopback())
            .unwrap_or(false)
    }
}

fn session_layer(config: &Config) -> SessionManagerLayer<MemoryStore> {
    let session_store = MemoryStore::default();
    SessionManagerLayer::new(session_store)
        .with_name("obr.sid")
        .with_http_only(true)
        .with_same_site(SameSite::Strict)
        .with_secure(config.secure_cookies)
        .with_expiry(Expiry::OnInactivity(config.session_duration()))
}

fn print_password_hash_from_stdin() -> Result<()> {
    let mut password = String::new();
    io::stdin()
        .read_to_string(&mut password)
        .context("read password from stdin")?;
    let password = password.trim_end_matches(&['\r', '\n'][..]);
    if password.is_empty() {
        bail!("password from stdin is empty");
    }
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|err| anyhow!("hash password: {err}"))?
        .to_string();
    println!("{hash}");
    Ok(())
}

async fn index() -> Html<&'static str> {
    Html(include_str!("../static/index.html"))
}

async fn api_config() -> Json<ConfigResponse> {
    Json(ConfigResponse { rss_enabled: false })
}

async fn login(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(body): Json<LoginRequest>,
) -> AppResult<Response> {
    if !verify_login(&state.config, &body.username, &body.password) {
        return Ok((StatusCode::UNAUTHORIZED, "failed").into_response());
    }

    session.cycle_id().await?;
    session.insert(AUTH_SESSION_KEY, true).await?;
    Ok("ok".into_response())
}

async fn logout(session: Session) -> AppResult<Response> {
    session.delete().await?;
    Ok("ok".into_response())
}

async fn verify(session: Session) -> AppResult<Response> {
    if is_authenticated(&session).await? {
        Ok("ok".into_response())
    } else {
        Ok((StatusCode::UNAUTHORIZED, "unauthorized").into_response())
    }
}

async fn get_page(
    State(state): State<Arc<AppState>>,
    session: Session,
    Query(query): Query<PageQuery>,
) -> AppResult<Response> {
    ensure_auth(&session).await?;

    if query.query_type.as_deref() == Some("rss") {
        return Ok(Json(vec![
            "NoPage".to_string(),
            String::new(),
            String::new(),
            String::new(),
        ])
        .into_response());
    }

    state.maybe_git_pull();
    let requested = match query.query_type.as_deref() {
        Some("rand") => match random_markdown_file(&state.config.vault_path)? {
            Some(path) => path,
            None => return Ok(Json(vec!["NoPage".to_string(), String::new()]).into_response()),
        },
        _ => {
            let path = query.path.unwrap_or_default();
            let rel = normalize_markdown_rel(&path, true)?;
            state.config.vault_path.join(rel)
        }
    };

    if !requested.exists() {
        return Ok(Json(vec!["NoPage".to_string(), String::new()]).into_response());
    }
    ensure_inside(&state.config.vault_path, &requested)?;
    let content = fs::read_to_string(&requested)
        .with_context(|| format!("read page {}", requested.display()))?;
    let rel = rel_to_vault(&state.config.vault_path, &requested)?;
    Ok(Json(vec![rel, content]).into_response())
}

async fn post_page(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(body): Json<PageUpdate>,
) -> AppResult<Response> {
    ensure_auth(&session).await?;
    let rel = normalize_markdown_rel(&body.file, false)?;
    let path = state.config.vault_path.join(rel);
    ensure_inside(&state.config.vault_path, &path)?;
    if !path.exists() {
        return Ok((StatusCode::NOT_FOUND, "NoPage").into_response());
    }
    fs::write(&path, body.content).with_context(|| format!("write {}", path.display()))?;
    state.maybe_git_sync();
    Ok("ok".into_response())
}

async fn search(
    State(state): State<Arc<AppState>>,
    session: Session,
    Query(query): Query<SearchQuery>,
) -> AppResult<Response> {
    ensure_auth(&session).await?;
    state.maybe_git_pull();

    let keyword = query.keyword.unwrap_or_default();
    let needle = keyword.to_lowercase();
    let mut hits = Vec::new();
    for entry in markdown_entries(&state.config.vault_path) {
        let entry = entry?;
        let path = entry.path().to_path_buf();
        let rel = rel_to_vault(&state.config.vault_path, &path)?;
        let display_rel = rel.strip_suffix(".md").unwrap_or(&rel);
        let path_matches = display_rel.to_lowercase().contains(&needle);
        let content_matches = !keyword.is_empty()
            && fs::read_to_string(&path)
                .unwrap_or_default()
                .to_lowercase()
                .contains(&needle);
        if keyword.is_empty() || path_matches || content_matches {
            let rank = if !keyword.is_empty() && path_matches {
                0
            } else {
                1
            };
            let modified = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or_default();
            hits.push((rank, modified, path));
        }
    }

    hits.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| b.1.cmp(&a.1)));
    let limit = if keyword.is_empty() { 20 } else { hits.len() };
    let mut body = String::new();
    for (_, _, path) in hits.into_iter().take(limit) {
        let mut rel = rel_to_vault(&state.config.vault_path, &path)?;
        if let Some(stripped) = rel.strip_suffix(".md") {
            rel = stripped.to_string();
        }
        body.push_str(&format!(
            "<li><a id=\"{}\" href=\"#\">{}</a></li>",
            escape_html_attr(&rel),
            escape_html(&rel)
        ));
    }
    Ok(Html(body).into_response())
}

async fn post_entry(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(body): Json<EntryRequest>,
) -> AppResult<Response> {
    ensure_auth(&session).await?;

    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M").to_string();

    let page = body.page.trim();
    let path = if page.is_empty() {
        state
            .config
            .vault_path
            .join("Daily")
            .join(format!("{date}.md"))
    } else {
        let rel = normalize_markdown_rel(&format!("Unsort/{page}"), true)?;
        state.config.vault_path.join(rel)
    };
    ensure_inside(&state.config.vault_path, &path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut existing = fs::read_to_string(&path).unwrap_or_default();
    if page.is_empty() && existing.is_empty() {
        existing = format!("## {date}");
    }

    let mut appended = if page.is_empty() {
        format!("\n## {time}")
    } else {
        format!("\n### {date} {time}")
    };

    if !body.links.trim().is_empty() {
        let links = body
            .links
            .split(',')
            .map(str::trim)
            .filter(|link| !link.is_empty())
            .map(|link| format!("[[{link}]]"))
            .collect::<Vec<_>>()
            .join(" ");
        if !links.is_empty() {
            appended.push_str(&format!("\nLinks: {links}"));
        }
    }

    let text = if page == "todo" {
        format!("- [ ] {}", body.text.trim())
    } else {
        body.text.trim().to_string()
    };
    appended.push('\n');
    appended.push_str(&text);

    if !body.image.trim().is_empty() {
        let image_name = save_data_url_image(&state.config.vault_path, &body.image, &now)?;
        appended.push_str(&format!("\n\n![[{image_name}|250]]\n"));
    }

    let content = if page == "todo" {
        format!("{appended}\n\n---\n\n{existing}")
    } else {
        format!("{existing}\n{appended}")
    };
    fs::write(&path, content).with_context(|| format!("write {}", path.display()))?;
    state.maybe_git_sync();
    Ok("ok".into_response())
}

async fn mark_todo(
    State(state): State<Arc<AppState>>,
    session: Session,
    Query(query): Query<MarkQuery>,
) -> AppResult<Response> {
    ensure_auth(&session).await?;
    let Some(index) = query.index else {
        return Ok((StatusCode::BAD_REQUEST, "missing index").into_response());
    };
    let path = state.config.vault_path.join("Unsort").join("todo.md");
    ensure_inside(&state.config.vault_path, &path)?;
    let content = fs::read_to_string(&path).unwrap_or_default();
    let mut checkbox_index = 0;
    let mut changed = false;
    let mut lines = Vec::new();

    for line in content.lines() {
        if line.contains("[ ]") || line.contains("[x]") || line.contains("[X]") {
            if checkbox_index == index && line.contains("[ ]") {
                lines.push(line.replacen("[ ]", "[x]", 1));
                changed = true;
            } else {
                lines.push(line.to_string());
            }
            checkbox_index += 1;
        } else {
            lines.push(line.to_string());
        }
    }

    if changed {
        fs::write(&path, lines.join("\n"))?;
        state.maybe_git_sync();
        Ok("done".into_response())
    } else {
        Ok((StatusCode::NOT_FOUND, "not found").into_response())
    }
}

async fn rss_stub(session: Session) -> AppResult<Response> {
    ensure_auth(&session).await?;
    Ok(Html("RSS is not implemented in obr yet.").into_response())
}

async fn rss_mark_stub(session: Session) -> AppResult<Response> {
    ensure_auth(&session).await?;
    Ok("ok".into_response())
}

async fn ensure_auth(session: &Session) -> AppResult<()> {
    if is_authenticated(session).await? {
        Ok(())
    } else {
        Err(AppError::unauthorized())
    }
}

async fn is_authenticated(session: &Session) -> Result<bool, tower_sessions::session::Error> {
    Ok(session
        .get::<bool>(AUTH_SESSION_KEY)
        .await?
        .unwrap_or(false))
}

fn verify_login(config: &Config, username: &str, password: &str) -> bool {
    if username != config.username {
        return false;
    }

    if let Some(hash) = &config.password_hash {
        let Ok(parsed_hash) = PasswordHash::new(hash) else {
            return false;
        };
        return Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok();
    }

    let Some(expected) = &config.password else {
        return false;
    };
    expected.as_bytes().ct_eq(password.as_bytes()).into()
}

fn markdown_entries(vault: &Path) -> impl Iterator<Item = walkdir::Result<DirEntry>> + '_ {
    WalkDir::new(vault)
        .into_iter()
        .filter_entry(|entry| !is_hidden(entry))
        .filter(|entry| {
            entry
                .as_ref()
                .map(|entry| {
                    entry.file_type().is_file()
                        && entry.path().extension().and_then(|ext| ext.to_str()) == Some("md")
                })
                .unwrap_or(true)
        })
}

fn is_hidden(entry: &DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|name| name.starts_with('.') && name != ".")
        .unwrap_or(false)
}

fn random_markdown_file(vault: &Path) -> Result<Option<PathBuf>> {
    let files = markdown_entries(vault)
        .filter_map(|entry| entry.ok().map(|entry| entry.path().to_path_buf()))
        .collect::<Vec<_>>();
    if files.is_empty() {
        return Ok(None);
    }
    let nanos = Local::now()
        .timestamp_nanos_opt()
        .unwrap_or_default()
        .unsigned_abs() as usize;
    Ok(files.get(nanos % files.len()).cloned())
}

fn normalize_markdown_rel(input: &str, add_extension: bool) -> Result<PathBuf> {
    let mut trimmed = input.trim().trim_start_matches('/').to_string();
    if trimmed.contains('\0') {
        bail!("path contains null byte");
    }
    if add_extension && !trimmed.ends_with(".md") {
        trimmed.push_str(".md");
    }
    let path = Path::new(&trimmed);
    if path.is_absolute() {
        bail!("absolute paths are not allowed");
    }
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            Component::ParentDir => bail!("parent path components are not allowed"),
            _ => bail!("unsupported path component"),
        }
    }
    if clean.as_os_str().is_empty() {
        bail!("empty path");
    }
    Ok(clean)
}

fn ensure_inside(vault: &Path, path: &Path) -> Result<()> {
    let parent = path.parent().ok_or_else(|| anyhow!("path has no parent"))?;
    let canonical_parent = if parent.exists() {
        parent.canonicalize()?
    } else {
        let mut existing = parent;
        while !existing.exists() {
            existing = existing
                .parent()
                .ok_or_else(|| anyhow!("no existing parent for {}", path.display()))?;
        }
        existing.canonicalize()?
    };
    if canonical_parent.starts_with(vault) {
        Ok(())
    } else {
        bail!("path escapes vault: {}", path.display())
    }
}

fn rel_to_vault(vault: &Path, path: &Path) -> Result<String> {
    let rel = path
        .strip_prefix(vault)
        .with_context(|| format!("{} is outside {}", path.display(), vault.display()))?;
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

fn save_data_url_image(vault: &Path, image: &str, now: &chrono::DateTime<Local>) -> Result<String> {
    let (meta, data) = image
        .split_once(',')
        .ok_or_else(|| anyhow!("invalid image data url"))?;
    if !meta.starts_with("data:image/") || !meta.ends_with(";base64") {
        bail!("unsupported image data url");
    }
    let mime = meta
        .trim_start_matches("data:image/")
        .trim_end_matches(";base64");
    let ext = match mime {
        "jpeg" | "jpg" => "jpg",
        "png" => "png",
        "gif" => "gif",
        "webp" => "webp",
        other => bail!("unsupported image type: {other}"),
    };
    let bytes = STANDARD.decode(data)?;
    let name = format!("obr-{}.{}", now.format("%Y-%m-%d-%H-%M-%S"), ext);
    let path = vault.join("Pics").join(&name);
    ensure_inside(vault, &path)?;
    fs::create_dir_all(vault.join("Pics"))?;
    fs::write(&path, bytes)?;
    Ok(name)
}

impl AppState {
    fn maybe_git_pull(&self) {
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

    fn maybe_git_sync(&self) {
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

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn escape_html_attr(value: &str) -> String {
    escape_html(value).replace('\'', "&#39;")
}
