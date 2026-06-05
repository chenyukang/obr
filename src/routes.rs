use std::{
    collections::hash_map::DefaultHasher,
    fmt::Write as FmtWrite,
    fs,
    hash::{Hash, Hasher},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::UNIX_EPOCH,
};

use anyhow::Context;
use axum::{
    Json,
    extract::{Multipart, Path as AxumPath, Query, State},
    http::{
        HeaderMap, StatusCode,
        header::{CACHE_CONTROL, CONTENT_TYPE, ETAG, HeaderValue, IF_NONE_MATCH},
    },
    response::{Html, IntoResponse, Response},
};
use chrono::{Local, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use tower_sessions::Session;
use tracing::warn;
use url::Url;
use uuid::Uuid;
use walkdir::WalkDir;
use webauthn_rs::prelude::{
    PasskeyAuthentication, PasskeyRegistration, PublicKeyCredential, RegisterPublicKeyCredential,
};

use crate::{
    app::AppState,
    auth::{AUTH_SESSION_KEY, allows_local_password_login, verify_login},
    error::{AppError, AppResult},
    markdown::{
        MarkdownBlock, auto_link_note_titles, ensure_inside, escape_html, escape_html_attr,
        mark_todo_content, normalize_markdown_rel, normalize_rel_path, rel_to_vault,
        render_markdown_blocks_for_file, render_markdown_html_for_file, save_data_url_image,
        save_image_bytes,
    },
    rss::{self, RssItemDetail, RssItemFilter},
};

const IMAGE_PREVIEW_WIDTH: u32 = 900;
const IMAGE_PREVIEW_QUALITY: u8 = 72;
const IMAGE_PREVIEW_MIN_WIDTH: u32 = 240;
const IMAGE_PREVIEW_MAX_WIDTH: u32 = 1600;
const IMAGE_PREVIEW_MIN_QUALITY: u8 = 45;
const IMAGE_PREVIEW_MAX_QUALITY: u8 = 86;

#[derive(Deserialize)]
pub(crate) struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Deserialize)]
pub(crate) struct PageQuery {
    path: Option<String>,
    query_type: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SearchQuery {
    keyword: Option<String>,
    page: Option<usize>,
}

#[derive(Deserialize)]
pub(crate) struct ImagePreviewQuery {
    w: Option<u32>,
    q: Option<u8>,
}

#[derive(Deserialize)]
pub(crate) struct PageUpdate {
    file: String,
    content: Option<String>,
    blocks: Option<Vec<PageUpdateBlock>>,
}

#[derive(Deserialize)]
pub(crate) struct PageUpdateBlock {
    source: String,
    separator: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct MarkdownBlocksRequest {
    file: String,
    content: String,
}

#[derive(Deserialize)]
pub(crate) struct EntryRequest {
    sync_id: Option<String>,
    created_at: Option<String>,
    page: String,
    links: String,
    text: String,
    image: String,
}

#[derive(Deserialize)]
pub(crate) struct MarkQuery {
    index: Option<usize>,
}

#[derive(Deserialize)]
pub(crate) struct RssItemsQuery {
    state: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
    q: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct RssReadRequest {
    read: bool,
}

#[derive(Deserialize)]
pub(crate) struct RssStarRequest {
    starred: bool,
}

#[derive(Deserialize)]
pub(crate) struct RssAnnotationRequest {
    note: String,
    quote: Option<String>,
}

#[derive(Serialize)]
struct RssAnnotationResponse {
    file: String,
    highlight_count: usize,
}

#[derive(Serialize)]
struct PasskeyStatus {
    registered: bool,
}

#[derive(Serialize)]
struct AuthOptions {
    passkey_registered: bool,
    password_login_allowed: bool,
}

#[derive(Serialize)]
struct PageResponse {
    file: String,
    source: String,
    html: String,
    blocks: Vec<MarkdownBlock>,
}

#[derive(Serialize)]
struct PageSourceResponse {
    file: String,
    content: String,
    blocks: Vec<MarkdownBlock>,
}

#[derive(Serialize)]
struct MarkdownBlocksResponse {
    blocks: Vec<MarkdownBlock>,
}

#[derive(Serialize)]
struct PingResponse {
    ok: bool,
}

#[derive(Serialize)]
struct AppConfigResponse {
    daily_dir: String,
    entry_dir: String,
    image_dir: String,
    todo_path: String,
    todo_file: String,
    dark_mode_start: Option<String>,
    dark_mode_end: Option<String>,
}

#[derive(Serialize)]
struct RssItemDetailResponse {
    #[serde(flatten)]
    item: RssItemDetail,
    html: String,
    ai_translation_html: Option<String>,
}

#[derive(Serialize)]
struct RssItemsResponse {
    items: Vec<rss::RssItemSummary>,
    next_offset: Option<usize>,
}

fn rss_item_detail_response(
    reader: &rss::RssReader,
    mut item: RssItemDetail,
) -> anyhow::Result<RssItemDetailResponse> {
    let html = reader.rendered_item_html(&mut item)?;
    let ai_translation_html = item
        .ai_translation_md
        .as_deref()
        .map(str::trim)
        .filter(|translation| !translation.is_empty())
        .map(|translation| {
            let file = item.content_path.as_deref().unwrap_or("rss/translation.md");
            render_markdown_html_for_file(translation, file)
        });
    Ok(RssItemDetailResponse {
        item,
        html,
        ai_translation_html,
    })
}

const PASSKEY_REGISTRATION_SESSION_KEY: &str = "passkey_registration";
const PASSKEY_AUTHENTICATION_SESSION_KEY: &str = "passkey_authentication";
const MAX_ENTRY_IMAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_RSS_ANNOTATION_NOTE_CHARS: usize = 8000;
const MAX_RSS_ANNOTATION_QUOTE_CHARS: usize = 4000;

pub(crate) async fn index() -> Html<&'static str> {
    Html(include_str!("../assets/index.html"))
}

pub(crate) async fn service_worker() -> Response {
    static_service_response(
        include_str!("../assets/sw.js"),
        "text/javascript; charset=utf-8",
        "no-cache",
    )
}

pub(crate) async fn manifest() -> Response {
    static_service_response(
        include_str!("../assets/manifest.webmanifest"),
        "application/manifest+json; charset=utf-8",
        "private, max-age=3600",
    )
}

pub(crate) async fn asset(AxumPath(path): AxumPath<String>) -> Response {
    match path.as_str() {
        "app.js" => static_service_response(
            include_str!("../assets/app.js"),
            "text/javascript; charset=utf-8",
            immutable_asset_cache_control(),
        ),
        "style.css" => static_service_response(
            include_str!("../assets/style.css"),
            "text/css; charset=utf-8",
            immutable_asset_cache_control(),
        ),
        "favicon.svg" => static_service_response(
            include_str!("../assets/favicon.svg"),
            "image/svg+xml",
            immutable_asset_cache_control(),
        ),
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

pub(crate) async fn ping() -> Response {
    let mut response = Json(PingResponse { ok: true }).into_response();
    response.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("no-store, max-age=0"),
    );
    response
}

fn static_service_response(
    body: &'static str,
    content_type: &'static str,
    cache: &'static str,
) -> Response {
    let mut response = body.into_response();
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static(content_type));
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static(cache));
    response
}

fn immutable_asset_cache_control() -> &'static str {
    "public, max-age=31536000, immutable"
}

pub(crate) async fn login(
    State(state): State<Arc<AppState>>,
    session: Session,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> AppResult<Response> {
    if state.passkey_store.has_credentials() && !allows_local_password_login(&headers) {
        return Ok((
            StatusCode::FORBIDDEN,
            "password login is disabled outside localhost after passkey registration",
        )
            .into_response());
    }

    let limiter_key = state.login_limiter_key(&body.username);
    if !state.login_limiter.is_allowed(&limiter_key) {
        return Ok((
            StatusCode::TOO_MANY_REQUESTS,
            "too many failed login attempts",
        )
            .into_response());
    }

    if !verify_login(&state.config, &body.username, &body.password) {
        state.login_limiter.record_failure(&limiter_key);
        return Ok((StatusCode::UNAUTHORIZED, "failed").into_response());
    }

    state.login_limiter.record_success(&limiter_key);
    session.cycle_id().await?;
    session.insert(AUTH_SESSION_KEY, true).await?;
    Ok("ok".into_response())
}

pub(crate) async fn auth_options(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let passkey_registered = state.passkey_store.has_credentials();
    Ok(Json(AuthOptions {
        passkey_registered,
        password_login_allowed: !passkey_registered || allows_local_password_login(&headers),
    })
    .into_response())
}

pub(crate) async fn passkey_register_start(
    State(state): State<Arc<AppState>>,
    session: Session,
) -> AppResult<Response> {
    let _ = session.remove_value(PASSKEY_REGISTRATION_SESSION_KEY).await;
    let exclude_credentials = state.passkey_store.credential_ids();
    let exclude_credentials = if exclude_credentials.is_empty() {
        None
    } else {
        Some(exclude_credentials)
    };
    let (challenge, registration_state) = state
        .webauthn
        .start_passkey_registration(
            state.passkey_store.user_id(),
            &state.config.username,
            &state.config.username,
            exclude_credentials,
        )
        .map_err(|_| AppError::bad_request("could not start passkey registration"))?;
    session
        .insert(PASSKEY_REGISTRATION_SESSION_KEY, registration_state)
        .await?;
    Ok(Json(challenge).into_response())
}

pub(crate) async fn passkey_register_finish(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(credential): Json<RegisterPublicKeyCredential>,
) -> AppResult<Response> {
    let registration_state: PasskeyRegistration = session
        .get(PASSKEY_REGISTRATION_SESSION_KEY)
        .await?
        .ok_or_else(|| AppError::bad_request("missing passkey registration state"))?;
    let _ = session.remove_value(PASSKEY_REGISTRATION_SESSION_KEY).await;
    let passkey = state
        .webauthn
        .finish_passkey_registration(&credential, &registration_state)
        .map_err(|_| AppError::bad_request("passkey registration failed"))?;
    state.passkey_store.add_credential(passkey)?;
    Ok("ok".into_response())
}

pub(crate) async fn passkey_login_start(
    State(state): State<Arc<AppState>>,
    session: Session,
) -> AppResult<Response> {
    let _ = session
        .remove_value(PASSKEY_AUTHENTICATION_SESSION_KEY)
        .await;
    let credentials = state.passkey_store.credentials();
    if credentials.is_empty() {
        return Ok((StatusCode::NOT_FOUND, "no passkey registered").into_response());
    }
    let (challenge, authentication_state) = state
        .webauthn
        .start_passkey_authentication(&credentials)
        .map_err(|_| AppError::bad_request("could not start passkey login"))?;
    session
        .insert(PASSKEY_AUTHENTICATION_SESSION_KEY, authentication_state)
        .await?;
    Ok(Json(challenge).into_response())
}

pub(crate) async fn passkey_login_finish(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(credential): Json<PublicKeyCredential>,
) -> AppResult<Response> {
    let authentication_state: PasskeyAuthentication = session
        .get(PASSKEY_AUTHENTICATION_SESSION_KEY)
        .await?
        .ok_or_else(|| AppError::bad_request("missing passkey login state"))?;
    let _ = session
        .remove_value(PASSKEY_AUTHENTICATION_SESSION_KEY)
        .await;
    let auth_result = state
        .webauthn
        .finish_passkey_authentication(&credential, &authentication_state)
        .map_err(|_| AppError::bad_request("passkey login failed"))?;
    state.passkey_store.update_credential(&auth_result)?;
    session.cycle_id().await?;
    session.insert(AUTH_SESSION_KEY, true).await?;
    Ok("ok".into_response())
}

pub(crate) async fn passkey_available(State(state): State<Arc<AppState>>) -> AppResult<Response> {
    Ok(Json(PasskeyStatus {
        registered: state.passkey_store.has_credentials(),
    })
    .into_response())
}

pub(crate) async fn passkey_status(State(state): State<Arc<AppState>>) -> AppResult<Response> {
    Ok(Json(PasskeyStatus {
        registered: state.passkey_store.has_credentials(),
    })
    .into_response())
}

pub(crate) async fn logout(session: Session) -> AppResult<Response> {
    session.delete().await?;
    Ok("ok".into_response())
}

pub(crate) async fn verify() -> AppResult<Response> {
    Ok("ok".into_response())
}

pub(crate) async fn app_config(State(state): State<Arc<AppState>>) -> AppResult<Response> {
    let todo_file = vault_rel_path(&state.config.todo_path);
    Ok(Json(AppConfigResponse {
        daily_dir: vault_rel_path(&state.config.daily_dir),
        entry_dir: vault_rel_path(&state.config.entry_dir),
        image_dir: vault_rel_path(&state.config.image_dir),
        todo_path: todo_file.trim_end_matches(".md").to_string(),
        todo_file,
        dark_mode_start: state.config.dark_mode_start.clone(),
        dark_mode_end: state.config.dark_mode_end.clone(),
    })
    .into_response())
}

pub(crate) async fn rss_status(State(state): State<Arc<AppState>>) -> AppResult<Response> {
    let status = if let Some(reader) = &state.rss_reader {
        reader.status()?
    } else {
        rss::disabled_status(&state.config)
    };
    Ok(Json(status).into_response())
}

pub(crate) async fn rss_feeds(State(state): State<Arc<AppState>>) -> AppResult<Response> {
    let Some(reader) = &state.rss_reader else {
        return Ok(Json(Vec::<rss::RssFeedSummary>::new()).into_response());
    };
    Ok(Json(reader.list_feeds()?).into_response())
}

pub(crate) async fn rss_items(
    State(state): State<Arc<AppState>>,
    Query(query): Query<RssItemsQuery>,
) -> AppResult<Response> {
    let Some(reader) = &state.rss_reader else {
        return Ok(Json(RssItemsResponse {
            items: Vec::new(),
            next_offset: None,
        })
        .into_response());
    };
    let filter = match query.state.as_deref() {
        Some("done") => RssItemFilter::Done,
        Some("all") => RssItemFilter::All,
        _ => RssItemFilter::Unread,
    };
    let reader = reader.clone();
    let list_reader = reader.clone();
    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let offset = query.offset.unwrap_or_default();
    let search = query.q.clone();
    let mut items = tokio::task::spawn_blocking(move || {
        list_reader.list_items(filter, limit + 1, offset, search.as_deref())
    })
    .await
    .context("join RSS items task")??;
    let next_offset = if items.len() > limit {
        items.truncate(limit);
        Some(offset.saturating_add(limit))
    } else {
        None
    };
    let warm_reader = reader.clone();
    let warm_ids = items.iter().map(|item| item.id.clone()).collect::<Vec<_>>();
    tokio::task::spawn_blocking(move || {
        if let Err(err) = warm_reader.warm_item_html_cache(&warm_ids) {
            warn!(error = %err, "warm RSS item HTML cache failed");
        }
    });
    Ok(Json(RssItemsResponse { items, next_offset }).into_response())
}

pub(crate) async fn rss_item(
    State(state): State<Arc<AppState>>,
    AxumPath(id): AxumPath<String>,
) -> AppResult<Response> {
    let Some(reader) = &state.rss_reader else {
        return Ok((StatusCode::NOT_FOUND, "RSS reader is disabled").into_response());
    };
    let reader = reader.clone();
    let response =
        tokio::task::spawn_blocking(move || -> anyhow::Result<Option<RssItemDetailResponse>> {
            let Some(mut item) = reader.get_item(&id)? else {
                return Ok(None);
            };
            if item.read_at.is_none() && reader.mark_item_read(&id, true)? {
                item.read_at = Some(Utc::now().to_rfc3339());
            }
            Ok(Some(rss_item_detail_response(&reader, item)?))
        })
        .await
        .context("join RSS item task")??;
    let Some(response) = response else {
        return Ok((StatusCode::NOT_FOUND, "RSS item not found").into_response());
    };
    Ok(Json(response).into_response())
}

pub(crate) async fn rss_mark_read(
    State(state): State<Arc<AppState>>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<RssReadRequest>,
) -> AppResult<Response> {
    let Some(reader) = &state.rss_reader else {
        return Ok((StatusCode::NOT_FOUND, "RSS reader is disabled").into_response());
    };
    if reader.mark_item_read(&id, body.read)? {
        Ok("ok".into_response())
    } else {
        Ok((StatusCode::NOT_FOUND, "RSS item not found").into_response())
    }
}

pub(crate) async fn rss_star(
    State(state): State<Arc<AppState>>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<RssStarRequest>,
) -> AppResult<Response> {
    let Some(reader) = &state.rss_reader else {
        return Ok((StatusCode::NOT_FOUND, "RSS reader is disabled").into_response());
    };
    if reader.mark_item_starred(&id, body.starred)? {
        Ok("ok".into_response())
    } else {
        Ok((StatusCode::NOT_FOUND, "RSS item not found").into_response())
    }
}

pub(crate) async fn rss_annotate(
    State(state): State<Arc<AppState>>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<RssAnnotationRequest>,
) -> AppResult<Response> {
    let Some(reader) = &state.rss_reader else {
        return Ok((StatusCode::NOT_FOUND, "RSS reader is disabled").into_response());
    };
    let note = normalize_annotation_text(&body.note, MAX_RSS_ANNOTATION_NOTE_CHARS);
    if note.is_empty() {
        return Ok((StatusCode::BAD_REQUEST, "annotation is empty").into_response());
    }
    let quote = body
        .quote
        .as_deref()
        .map(|quote| normalize_annotation_text(quote, MAX_RSS_ANNOTATION_QUOTE_CHARS))
        .filter(|quote| !quote.is_empty());
    let Some(item) = reader.get_item(&id)? else {
        return Ok((StatusCode::NOT_FOUND, "RSS item not found").into_response());
    };
    let saved = save_rss_annotation(&state, &item, &note, quote.as_deref())?;
    state.maybe_git_sync();
    Ok(Json(saved).into_response())
}

pub(crate) async fn rss_summarize(
    State(state): State<Arc<AppState>>,
    AxumPath(id): AxumPath<String>,
) -> AppResult<Response> {
    let Some(reader) = &state.rss_reader else {
        return Ok((StatusCode::NOT_FOUND, "RSS reader is disabled").into_response());
    };
    if !reader.can_summarize_items() {
        return Ok((StatusCode::BAD_REQUEST, "RSS AI summary is not configured").into_response());
    }
    let reader = reader.clone();
    let Some(item) = reader.summarize_item(&id).await? else {
        return Ok((StatusCode::NOT_FOUND, "RSS item not found").into_response());
    };
    let render_reader = reader.clone();
    let response = tokio::task::spawn_blocking(move || -> anyhow::Result<RssItemDetailResponse> {
        rss_item_detail_response(&render_reader, item)
    })
    .await
    .context("join RSS summarize task")??;
    Ok(Json(response).into_response())
}

pub(crate) async fn rss_translate(
    State(state): State<Arc<AppState>>,
    AxumPath(id): AxumPath<String>,
) -> AppResult<Response> {
    let Some(reader) = &state.rss_reader else {
        return Ok((StatusCode::NOT_FOUND, "RSS reader is disabled").into_response());
    };
    if !reader.can_translate_items() {
        return Ok((
            StatusCode::BAD_REQUEST,
            "RSS AI translation is not configured",
        )
            .into_response());
    }
    let reader = reader.clone();
    let Some(item) = reader.translate_item(&id).await? else {
        return Ok((StatusCode::NOT_FOUND, "RSS item not found").into_response());
    };
    let render_reader = reader.clone();
    let response = tokio::task::spawn_blocking(move || -> anyhow::Result<RssItemDetailResponse> {
        rss_item_detail_response(&render_reader, item)
    })
    .await
    .context("join RSS translate task")??;
    Ok(Json(response).into_response())
}

pub(crate) async fn rss_unsubscribe(
    State(state): State<Arc<AppState>>,
    AxumPath(id): AxumPath<String>,
) -> AppResult<Response> {
    let Some(reader) = &state.rss_reader else {
        return Ok((StatusCode::NOT_FOUND, "RSS reader is disabled").into_response());
    };
    let Some(summary) = reader.unsubscribe_feed(&id)? else {
        return Ok((StatusCode::NOT_FOUND, "RSS feed not found").into_response());
    };
    Ok(Json(summary).into_response())
}

pub(crate) async fn rss_refresh(State(state): State<Arc<AppState>>) -> AppResult<Response> {
    let Some(reader) = &state.rss_reader else {
        return Ok((StatusCode::NOT_FOUND, "RSS reader is disabled").into_response());
    };
    Ok(Json(reader.refresh().await?).into_response())
}

fn save_rss_annotation(
    state: &AppState,
    item: &RssItemDetail,
    note: &str,
    quote: Option<&str>,
) -> AppResult<RssAnnotationResponse> {
    let root = state.config.vault_path.join(&state.config.annotation_dir);
    ensure_inside(&state.config.vault_path, &root)?;
    fs::create_dir_all(&root)?;

    let page_url = rss_annotation_url(item);
    let page_hash = rss_annotation_page_hash(&page_url);
    let now = Local::now();
    let created_at = Utc::now().to_rfc3339();
    let path = find_rss_annotation_file(&root, &page_hash)?
        .unwrap_or_else(|| unique_rss_annotation_path(&root, &now, &item.title, &page_hash));
    ensure_inside(&root, &path)?;

    let existing = fs::read_to_string(&path).unwrap_or_default();
    let item_markdown = rss_annotation_item_markdown(item, note, quote, &now, &page_url);
    let content = if existing.trim().is_empty() {
        new_rss_annotation_markdown(
            item,
            &page_url,
            &page_hash,
            &created_at,
            &now,
            &item_markdown,
        )
    } else {
        append_rss_annotation_markdown(&existing, &created_at, &item_markdown)
    };
    fs::write(&path, &content).with_context(|| format!("write {}", path.display()))?;
    state.markdown_index.update_path(&path, content.clone())?;
    Ok(RssAnnotationResponse {
        file: rel_to_vault(&state.config.vault_path, &path)?,
        highlight_count: rss_annotation_highlight_count(&content),
    })
}

fn rss_annotation_url(item: &RssItemDetail) -> String {
    let url = item.url.trim();
    if url.is_empty() {
        item.feed_url.trim().to_string()
    } else {
        url.to_string()
    }
}

fn rss_annotation_page_hash(url: &str) -> String {
    Uuid::new_v5(&Uuid::NAMESPACE_URL, url.as_bytes())
        .simple()
        .to_string()
}

fn find_rss_annotation_file(root: &Path, page_hash: &str) -> AppResult<Option<PathBuf>> {
    let needles = [
        format!("page_hash: '{}'", yaml_single_quoted(page_hash)),
        format!("page_hash: \"{page_hash}\""),
        format!("page_hash: {page_hash}"),
    ];
    for entry in WalkDir::new(root).min_depth(1).max_depth(2) {
        let entry = entry?;
        if !entry.file_type().is_file()
            || entry.path().extension().and_then(|ext| ext.to_str()) != Some("md")
        {
            continue;
        }
        let Ok(content) = fs::read_to_string(entry.path()) else {
            continue;
        };
        if needles.iter().any(|needle| content.contains(needle)) {
            return Ok(Some(entry.path().to_path_buf()));
        }
    }
    Ok(None)
}

fn unique_rss_annotation_path(
    root: &Path,
    now: &chrono::DateTime<Local>,
    title: &str,
    page_hash: &str,
) -> PathBuf {
    let date = now.format("%Y-%m-%d");
    let stem = sanitize_annotation_filename(title);
    let base = format!("{date}-{stem}");
    let first = root.join(format!("{base}.md"));
    if !first.exists() {
        return first;
    }
    let short_hash = page_hash.chars().take(8).collect::<String>();
    root.join(format!("{base}-{short_hash}.md"))
}

fn sanitize_annotation_filename(title: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for ch in title.trim().chars() {
        let replacement = if ch.is_control()
            || ch.is_whitespace()
            || matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        {
            '-'
        } else {
            ch
        };
        if replacement == '-' {
            if !last_dash && !output.is_empty() {
                output.push('-');
                last_dash = true;
            }
        } else {
            output.push(replacement);
            last_dash = false;
        }
        if output.chars().count() >= 48 {
            break;
        }
    }
    let output = output.trim_matches('-').to_string();
    if output.is_empty() {
        "RSS-annotation".to_string()
    } else {
        output
    }
}

fn new_rss_annotation_markdown(
    item: &RssItemDetail,
    page_url: &str,
    page_hash: &str,
    created_at: &str,
    now: &chrono::DateTime<Local>,
    item_markdown: &str,
) -> String {
    let date = now.format("%Y-%m-%d").to_string();
    let author = rss_annotation_author(item);
    let site = rss_annotation_site(page_url, item);
    format!(
        "---\n\
doc_type: hypothesis-highlights\n\
url: '{}'\n\
author: '{}'\n\
site: '{}'\n\
reference: '{}'\n\
category: '#article'\n\
source: 'obr-rss'\n\
file_date: '{}'\n\
page_hash: '{}'\n\
highlight_count: 1\n\
tags: ['RSS']\n\
created_at: '{}'\n\
updated_at: '{}'\n\
---\n\n\
## Metadata\n\
- Author: [{}]()\n\
- Reference: {}\n\
- Category: #article\n\n\
## Highlights\n\
{}",
        yaml_single_quoted(page_url),
        yaml_single_quoted(&author),
        yaml_single_quoted(&site),
        yaml_single_quoted(page_url),
        yaml_single_quoted(&date),
        yaml_single_quoted(page_hash),
        yaml_single_quoted(created_at),
        yaml_single_quoted(created_at),
        author,
        page_url,
        item_markdown,
    )
}

fn append_rss_annotation_markdown(existing: &str, updated_at: &str, item_markdown: &str) -> String {
    let mut content = update_frontmatter_field(
        existing,
        "highlight_count",
        &rss_annotation_highlight_count(existing)
            .saturating_add(1)
            .to_string(),
    );
    content = update_frontmatter_field(
        &content,
        "updated_at",
        &format!("'{}'", yaml_single_quoted(updated_at)),
    );
    if !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(item_markdown);
    content
}

fn rss_annotation_item_markdown(
    item: &RssItemDetail,
    note: &str,
    quote: Option<&str>,
    now: &chrono::DateTime<Local>,
    page_url: &str,
) -> String {
    let quote = quote
        .map(|quote| normalize_annotation_text(quote, MAX_RSS_ANNOTATION_QUOTE_CHARS))
        .filter(|quote| !quote.is_empty())
        .unwrap_or_else(|| normalize_annotation_text(&item.title, MAX_RSS_ANNOTATION_QUOTE_CHARS));
    let note = normalize_annotation_text(note, MAX_RSS_ANNOTATION_NOTE_CHARS);
    let updated = now.format("%Y-%m-%d %H:%M:%S");
    format!(
        "- {} - [Updated on {}]({}) - Group: #Notes\n  - Note: {}\n  - Tags: #RSS\n",
        quote, updated, page_url, note
    )
}

fn update_frontmatter_field(content: &str, key: &str, value: &str) -> String {
    let mut in_frontmatter = false;
    let mut replaced = false;
    let mut output = Vec::new();
    for (index, line) in content.lines().enumerate() {
        if index == 0 && line.trim() == "---" {
            in_frontmatter = true;
            output.push(line.to_string());
            continue;
        }
        if in_frontmatter && line.trim() == "---" {
            if !replaced {
                output.push(format!("{key}: {value}"));
                replaced = true;
            }
            in_frontmatter = false;
            output.push(line.to_string());
            continue;
        }
        if in_frontmatter && line.trim_start().starts_with(&format!("{key}:")) {
            output.push(format!("{key}: {value}"));
            replaced = true;
        } else {
            output.push(line.to_string());
        }
    }
    let mut updated = output.join("\n");
    if content.ends_with('\n') {
        updated.push('\n');
    }
    updated
}

fn rss_annotation_highlight_count(content: &str) -> usize {
    content
        .split("## Highlights")
        .nth(1)
        .map(|highlights| {
            highlights
                .lines()
                .filter(|line| line.starts_with("- "))
                .count()
        })
        .unwrap_or(0)
}

fn rss_annotation_author(item: &RssItemDetail) -> String {
    item.author
        .as_deref()
        .map(str::trim)
        .filter(|author| !author.is_empty())
        .or_else(|| {
            let feed_title = item.feed_title.trim();
            (!feed_title.is_empty()).then_some(feed_title)
        })
        .or_else(|| {
            let feed_url = item.feed_url.trim();
            (!feed_url.is_empty()).then_some(feed_url)
        })
        .unwrap_or("RSS")
        .to_string()
}

fn rss_annotation_site(page_url: &str, item: &RssItemDetail) -> String {
    Url::parse(page_url)
        .ok()
        .and_then(|url| url.host_str().map(ToString::to_string))
        .or_else(|| {
            Url::parse(&item.feed_url)
                .ok()
                .and_then(|url| url.host_str().map(ToString::to_string))
        })
        .unwrap_or_else(|| "rss".to_string())
}

fn yaml_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn normalize_annotation_text(value: &str, limit: usize) -> String {
    let mut output = String::new();
    let mut last_space = false;
    for ch in value.trim().chars().take(limit) {
        if ch.is_whitespace() {
            if !last_space && !output.is_empty() {
                output.push(' ');
                last_space = true;
            }
        } else {
            output.push(ch);
            last_space = false;
        }
    }
    output.trim().to_string()
}

pub(crate) async fn get_page(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PageQuery>,
) -> AppResult<Response> {
    let Some((rel, content)) = read_page_content(&state, query)? else {
        return Ok(Json(PageResponse {
            file: "NoPage".to_string(),
            source: String::new(),
            html: String::new(),
            blocks: Vec::new(),
        })
        .into_response());
    };
    Ok(Json(render_page_response(rel, content)).into_response())
}

pub(crate) async fn get_page_source(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PageQuery>,
) -> AppResult<Response> {
    let Some((rel, content)) = read_page_content(&state, query)? else {
        return Ok(Json(PageSourceResponse {
            file: "NoPage".to_string(),
            content: String::new(),
            blocks: Vec::new(),
        })
        .into_response());
    };
    let blocks = render_markdown_blocks_for_file(&content, &rel);
    Ok(Json(PageSourceResponse {
        file: rel,
        content,
        blocks,
    })
    .into_response())
}

pub(crate) async fn post_page(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PageUpdate>,
) -> AppResult<Response> {
    let rel = normalize_markdown_rel(&body.file, false)?;
    let path = state.config.vault_path.join(rel);
    ensure_inside(&state.config.vault_path, &path)?;
    if !path.exists() {
        return Ok((StatusCode::NOT_FOUND, "NoPage").into_response());
    }
    let content = page_update_content(body);
    fs::write(&path, &content).with_context(|| format!("write {}", path.display()))?;
    state.markdown_index.update_path(&path, content.clone())?;
    state.maybe_git_sync();
    let rel = rel_to_vault(&state.config.vault_path, &path)?;
    Ok(Json(render_page_response(rel, content)).into_response())
}

pub(crate) async fn render_markdown_blocks(Json(body): Json<MarkdownBlocksRequest>) -> Response {
    let file = normalize_markdown_rel(&body.file, false)
        .map(|path| vault_rel_path(&path))
        .unwrap_or_else(|_| body.file.trim().to_string());
    Json(MarkdownBlocksResponse {
        blocks: render_markdown_blocks_for_file(&body.content, &file),
    })
    .into_response()
}

fn render_page_response(file: String, source: String) -> PageResponse {
    PageResponse {
        html: render_markdown_html_for_file(&source, &file),
        blocks: render_markdown_blocks_for_file(&source, &file),
        file,
        source,
    }
}

fn page_update_content(body: PageUpdate) -> String {
    if let Some(blocks) = body.blocks {
        return blocks
            .into_iter()
            .map(|block| {
                format!(
                    "{}{}",
                    normalize_markdown_text(&block.source),
                    normalize_markdown_text(&block.separator.unwrap_or_default())
                )
            })
            .collect();
    }

    normalize_markdown_text(&body.content.unwrap_or_default())
}

fn normalize_markdown_text(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn read_page_content(state: &AppState, query: PageQuery) -> AppResult<Option<(String, String)>> {
    state.maybe_git_pull();
    let requested = match query.query_type.as_deref() {
        Some("rand") => match state.markdown_index.random_file()? {
            Some(path) => path,
            None => return Ok(None),
        },
        Some("todo") => state.config.vault_path.join(&state.config.todo_path),
        _ => state
            .markdown_index
            .resolve_request(&query.path.unwrap_or_default())?,
    };

    if !requested.exists() {
        return Ok(None);
    }
    ensure_inside(&state.config.vault_path, &requested)?;
    let Some(content) = state.markdown_index.read_path(&requested)? else {
        return Ok(None);
    };
    let rel = rel_to_vault(&state.config.vault_path, &requested)?;
    Ok(Some((rel, content)))
}

pub(crate) async fn search(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> AppResult<Response> {
    state.maybe_git_pull();

    let keyword = query.keyword.unwrap_or_default();
    let page = query.page.unwrap_or_default();
    let results = state.markdown_index.search_page(&keyword, page)?;
    let total_matches = results.total_matches;
    let offset = results.offset;
    let returned_hits = results.paths.len();
    let mut body = String::new();
    for path in results.paths {
        body.push_str(&render_search_result_item(&state.config.vault_path, &path)?);
    }
    let shown = offset.saturating_add(returned_hits);
    if shown < total_matches {
        body.push_str(&render_search_more_item(
            page.saturating_add(1),
            shown,
            total_matches,
        ));
    }
    Ok(Html(body).into_response())
}

fn render_search_result_item(vault_path: &Path, path: &Path) -> AppResult<String> {
    let mut rel = rel_to_vault(vault_path, path)?;
    if let Some(stripped) = rel.strip_suffix(".md") {
        rel = stripped.to_string();
    }
    Ok(format!(
        r##"<li><a id="{}" href="#">{}</a></li>"##,
        escape_html_attr(&rel),
        escape_html(&rel)
    ))
}

fn render_search_more_item(next_page: usize, shown: usize, total_matches: usize) -> String {
    let mut html = String::new();
    html.push_str(r#"<li class="search-more-row">"#);
    let _ = write!(
        html,
        r#"<button class="search-more" type="button" data-search-page="{next_page}">"#
    );
    let _ = write!(html, "More <span>{shown} / {total_matches}</span>");
    html.push_str("</button></li>");
    html
}

pub(crate) async fn image(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    AxumPath(path): AxumPath<String>,
) -> AppResult<Response> {
    let Some((path, metadata)) = resolve_image_file(&state, &path)? else {
        return Ok((StatusCode::NOT_FOUND, "not found").into_response());
    };
    image_file_response(&path, &metadata, &headers, original_image_cache_control())
}

pub(crate) async fn image_preview(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<ImagePreviewQuery>,
    AxumPath(path): AxumPath<String>,
) -> AppResult<Response> {
    let Some((source_path, source_metadata)) = resolve_image_file(&state, &path)? else {
        return Ok((StatusCode::NOT_FOUND, "not found").into_response());
    };
    if !can_preview_image(&source_path) {
        return image_file_response(
            &source_path,
            &source_metadata,
            &headers,
            preview_image_cache_control(),
        );
    }

    let width = query
        .w
        .unwrap_or(IMAGE_PREVIEW_WIDTH)
        .clamp(IMAGE_PREVIEW_MIN_WIDTH, IMAGE_PREVIEW_MAX_WIDTH);
    let quality = query
        .q
        .unwrap_or(IMAGE_PREVIEW_QUALITY)
        .clamp(IMAGE_PREVIEW_MIN_QUALITY, IMAGE_PREVIEW_MAX_QUALITY);
    let etag_value = image_etag("preview", &source_metadata, Some((width, quality)));
    let cache_control = preview_image_cache_control();
    if request_etag_matches(&headers, &etag_value) {
        return not_modified_response(cache_control, &etag_value);
    }

    let cache_path = image_preview_cache_path(
        &state.data_dir,
        &source_path,
        &source_metadata,
        width,
        quality,
    );
    let cache_hit = cache_path.is_file();
    if !cache_hit {
        let source_path_for_task = source_path.clone();
        let cache_path_for_task = cache_path.clone();
        let generated = tokio::task::spawn_blocking(move || {
            ensure_image_preview(&source_path_for_task, &cache_path_for_task, width, quality)
        })
        .await;
        match generated {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                warn!(
                    path = %source_path.display(),
                    error = %error,
                    "image preview generation failed; falling back to original"
                );
                return image_file_response(
                    &source_path,
                    &source_metadata,
                    &headers,
                    preview_image_cache_control(),
                );
            }
            Err(error) => {
                warn!(
                    path = %source_path.display(),
                    error = %error,
                    "image preview generation task failed; falling back to original"
                );
                return image_file_response(
                    &source_path,
                    &source_metadata,
                    &headers,
                    preview_image_cache_control(),
                );
            }
        }
    }

    let preview_bytes = fs::read(&cache_path)
        .with_context(|| format!("read image preview {}", cache_path.display()))?;
    image_bytes_response(
        preview_bytes,
        "image/jpeg",
        cache_control,
        Some(&etag_value),
    )
}

fn resolve_image_file(state: &AppState, path: &str) -> AppResult<Option<(PathBuf, fs::Metadata)>> {
    let rel = normalize_rel_path(path)?;
    let Some(path) =
        resolve_attachment_path(&state.config.vault_path, &state.config.image_dir, &rel)?
    else {
        return Ok(None);
    };

    let metadata = fs::metadata(&path).with_context(|| format!("stat image {}", path.display()))?;
    Ok(Some((path, metadata)))
}

fn resolve_attachment_path(
    vault: &Path,
    image_dir: &Path,
    rel: &Path,
) -> AppResult<Option<PathBuf>> {
    let vault = vault.canonicalize()?;
    let image_root = vault.join(image_dir);
    let is_bare_filename = rel.components().count() == 1;
    let candidates = if is_bare_filename {
        vec![image_root.join(rel), vault.join(rel)]
    } else {
        vec![vault.join(rel), image_root.join(rel)]
    };

    for candidate in candidates {
        ensure_inside(&vault, &candidate)?;
        if candidate.is_file() {
            return Ok(Some(candidate));
        }
    }

    if is_bare_filename && is_supported_attachment_path(rel) {
        let Some(file_name) = rel.file_name() else {
            return Ok(None);
        };
        let mut matches = Vec::new();
        for entry in WalkDir::new(&vault).follow_links(false) {
            let entry = entry?;
            if entry.file_type().is_file()
                && entry.path().file_name() == Some(file_name)
                && is_supported_attachment_path(entry.path())
            {
                matches.push(entry.path().to_path_buf());
            }
        }
        matches.sort_by_key(|path| rel_to_vault(&vault, path).unwrap_or_default());
        if let Some(path) = matches.into_iter().next() {
            ensure_inside(&vault, &path)?;
            return Ok(Some(path));
        }
    }

    Ok(None)
}

fn is_supported_attachment_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .is_some_and(|extension| {
            matches!(
                extension.as_str(),
                "jpg" | "jpeg" | "png" | "webp" | "gif" | "svg" | "heic" | "heif" | "pdf"
            )
        })
}

fn image_file_response(
    path: &Path,
    metadata: &fs::Metadata,
    headers: &HeaderMap,
    cache_control: HeaderValue,
) -> AppResult<Response> {
    let etag_value = image_etag("original", metadata, None);
    if request_etag_matches(headers, &etag_value) {
        return not_modified_response(cache_control, &etag_value);
    }

    let bytes = fs::read(path).with_context(|| format!("read image {}", path.display()))?;
    let content_type = mime_guess::from_path(path).first_or_octet_stream();
    image_bytes_response(
        bytes,
        content_type.as_ref(),
        cache_control,
        Some(&etag_value),
    )
}

fn image_bytes_response(
    bytes: Vec<u8>,
    content_type: &str,
    cache_control: HeaderValue,
    etag_value: Option<&str>,
) -> AppResult<Response> {
    let mut response = bytes.into_response();
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_str(content_type)?);
    response.headers_mut().insert(CACHE_CONTROL, cache_control);
    if let Some(etag_value) = etag_value {
        response
            .headers_mut()
            .insert(ETAG, HeaderValue::from_str(etag_value)?);
    }
    Ok(response)
}

fn not_modified_response(cache_control: HeaderValue, etag_value: &str) -> AppResult<Response> {
    let mut response = StatusCode::NOT_MODIFIED.into_response();
    response.headers_mut().insert(CACHE_CONTROL, cache_control);
    response
        .headers_mut()
        .insert(ETAG, HeaderValue::from_str(etag_value)?);
    Ok(response)
}

fn request_etag_matches(headers: &HeaderMap, etag_value: &str) -> bool {
    headers
        .get(IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(',').any(|tag| tag.trim() == etag_value))
}

fn image_etag(kind: &str, metadata: &fs::Metadata, preview: Option<(u32, u8)>) -> String {
    let modified = metadata_modified_nanos(metadata);
    if let Some((width, quality)) = preview {
        return format!(
            r#""{kind}-{}-{modified}-w{width}-q{quality}""#,
            metadata.len()
        );
    }
    format!(r#""{kind}-{}-{modified}""#, metadata.len())
}

fn metadata_modified_nanos(metadata: &fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

fn original_image_cache_control() -> HeaderValue {
    HeaderValue::from_static("private, max-age=2592000, immutable")
}

fn preview_image_cache_control() -> HeaderValue {
    HeaderValue::from_static("private, max-age=86400")
}

fn can_preview_image(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .is_some_and(|extension| matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp"))
}

fn image_preview_cache_path(
    data_dir: &Path,
    source_path: &Path,
    metadata: &fs::Metadata,
    width: u32,
    quality: u8,
) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    source_path.to_string_lossy().hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    metadata_modified_nanos(metadata).hash(&mut hasher);
    width.hash(&mut hasher);
    quality.hash(&mut hasher);
    data_dir
        .join("image-preview")
        .join(format!("{:016x}-w{width}-q{quality}.jpg", hasher.finish()))
}

fn ensure_image_preview(
    source_path: &Path,
    cache_path: &Path,
    width: u32,
    quality: u8,
) -> anyhow::Result<()> {
    if cache_path.is_file() {
        return Ok(());
    }
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let source = ::image::ImageReader::open(source_path)?
        .with_guessed_format()?
        .decode()?;
    let preview = source.thumbnail(width, width).to_rgb8();
    let temp_path = cache_path.with_extension(format!(
        "jpg.{}.{}.tmp",
        std::process::id(),
        Local::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let file = fs::File::create(&temp_path)?;
    let mut writer = BufWriter::new(file);
    let mut encoder = ::image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, quality);
    encoder.encode(
        &preview,
        preview.width(),
        preview.height(),
        ::image::ColorType::Rgb8.into(),
    )?;
    writer.flush()?;
    fs::rename(&temp_path, cache_path)?;
    Ok(())
}

pub(crate) async fn post_entry(
    State(state): State<Arc<AppState>>,
    Json(body): Json<EntryRequest>,
) -> AppResult<Response> {
    let entry_time = entry_timestamp(body.created_at.as_deref(), body.sync_id.as_deref());
    let date = entry_time.format("%Y-%m-%d").to_string();
    let dedupe = body
        .sync_id
        .as_deref()
        .is_some_and(|id| !id.trim().is_empty());
    if dedupe && entry_already_contains_body(&state, &body.page, &body.links, &body.text, &date)? {
        return Ok("ok".into_response());
    }
    let image_name = if body.image.trim().is_empty() {
        None
    } else {
        Some(save_data_url_image(
            &state.config.vault_path,
            &state.config.image_dir,
            &body.image,
            &entry_time,
        )?)
    };
    write_entry(
        state,
        EntryPayload {
            entry_time,
            dedupe,
            page: body.page,
            links: body.links,
            text: body.text,
            image_name,
        },
    )
}

pub(crate) async fn post_entry_multipart(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> AppResult<Response> {
    let mut sync_id = String::new();
    let mut created_at = String::new();
    let mut page = String::new();
    let mut links = String::new();
    let mut text = String::new();
    let mut image_data = None;
    let mut image_type = String::new();
    let mut dedupe = false;

    while let Some(field) = multipart.next_field().await.map_err(anyhow::Error::from)? {
        let name = field.name().unwrap_or_default().to_string();
        match name.as_str() {
            "sync_id" => {
                sync_id = field.text().await.map_err(anyhow::Error::from)?;
                dedupe = !sync_id.trim().is_empty()
            }
            "created_at" => created_at = field.text().await.map_err(anyhow::Error::from)?,
            "page" => page = field.text().await.map_err(anyhow::Error::from)?,
            "links" => links = field.text().await.map_err(anyhow::Error::from)?,
            "text" => text = field.text().await.map_err(anyhow::Error::from)?,
            "image" => {
                let content_type = field
                    .content_type()
                    .map(str::to_owned)
                    .unwrap_or_else(|| "image/jpeg".to_string());
                let file_name = field.file_name().map(str::to_owned);
                image_type = normalize_multipart_image_type(&content_type, file_name.as_deref());
                let bytes = field.bytes().await.map_err(anyhow::Error::from)?;
                if bytes.len() > MAX_ENTRY_IMAGE_BYTES {
                    return Ok((StatusCode::PAYLOAD_TOO_LARGE, "image too large").into_response());
                }
                if !bytes.is_empty() {
                    image_data = Some(bytes.to_vec());
                }
            }
            _ => {}
        }
    }

    let entry_time = entry_timestamp(Some(&created_at), Some(&sync_id));
    let date = entry_time.format("%Y-%m-%d").to_string();
    if dedupe && entry_already_contains_body(&state, &page, &links, &text, &date)? {
        return Ok("ok".into_response());
    }

    let image_name = if let Some(bytes) = image_data {
        Some(save_image_bytes(
            &state.config.vault_path,
            &state.config.image_dir,
            &bytes,
            &image_type,
            &entry_time,
        )?)
    } else {
        None
    };

    let response = write_entry(
        state,
        EntryPayload {
            entry_time,
            dedupe,
            page: page.clone(),
            links,
            text,
            image_name,
        },
    )?;
    Ok(response)
}

struct EntryPayload {
    entry_time: chrono::DateTime<Local>,
    dedupe: bool,
    page: String,
    links: String,
    text: String,
    image_name: Option<String>,
}

fn normalize_multipart_image_type(content_type: &str, file_name: Option<&str>) -> String {
    match content_type {
        "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/heic" | "image/heif" => {
            content_type.to_string()
        }
        _ => file_name
            .and_then(|name| {
                name.rsplit_once('.')
                    .map(|(_, ext)| ext.to_ascii_lowercase())
            })
            .unwrap_or_else(|| "jpg".to_string()),
    }
}

fn entry_timestamp(created_at: Option<&str>, sync_id: Option<&str>) -> chrono::DateTime<Local> {
    created_at
        .and_then(parse_entry_created_at)
        .or_else(|| sync_id.and_then(parse_entry_sync_id_timestamp))
        .unwrap_or_else(Local::now)
}

fn parse_entry_created_at(value: &str) -> Option<chrono::DateTime<Local>> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.with_timezone(&Local))
}

fn parse_entry_sync_id_timestamp(sync_id: &str) -> Option<chrono::DateTime<Local>> {
    let millis = sync_id
        .trim()
        .split_once('-')
        .map(|(prefix, _)| prefix)
        .unwrap_or(sync_id)
        .parse::<i64>()
        .ok()?;
    if !(946_684_800_000..4_102_444_800_000).contains(&millis) {
        return None;
    }
    Local.timestamp_millis_opt(millis).single()
}

fn entry_already_contains_body(
    state: &AppState,
    page: &str,
    links: &str,
    text: &str,
    date: &str,
) -> AppResult<bool> {
    let path = entry_path(state, page, date)?;
    ensure_inside(&state.config.vault_path, &path)?;
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let body = entry_body_markdown(&state.config.vault_path, page, links, text)?;
    Ok(entry_body_already_exists(&existing, &body))
}

fn write_entry(state: Arc<AppState>, body: EntryPayload) -> AppResult<Response> {
    let date = body.entry_time.format("%Y-%m-%d").to_string();
    let time = body.entry_time.format("%H:%M").to_string();

    let page = body.page.trim();
    if page.is_empty()
        && body.links.trim().is_empty()
        && body.text.trim().is_empty()
        && body.image_name.is_none()
    {
        return Ok((StatusCode::BAD_REQUEST, "empty post").into_response());
    }

    let path = entry_path(&state, page, &date)?;
    ensure_inside(&state.config.vault_path, &path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut existing = fs::read_to_string(&path).unwrap_or_default();
    let entry_body = entry_body_markdown(&state.config.vault_path, page, &body.links, &body.text)?;
    if body.dedupe && entry_body_already_exists(&existing, &entry_body) {
        return Ok("ok".into_response());
    }
    if page.is_empty() && existing.is_empty() {
        existing = format!("## {date}");
    }

    let mut appended = if page.is_empty() {
        format!("\n## {time}")
    } else {
        format!("\n### {date} {time}")
    };

    appended.push('\n');
    appended.push_str(&entry_body);

    if let Some(image_name) = body.image_name {
        appended.push_str(&format!("\n\n![[{image_name}|250]]\n"));
    }

    let content = if is_todo_page(page) {
        format!("{appended}\n\n---\n\n{existing}")
    } else {
        format!("{existing}\n{appended}")
    };
    fs::write(&path, &content).with_context(|| format!("write {}", path.display()))?;
    state.markdown_index.update_path(&path, content)?;
    state.maybe_git_sync();
    Ok("ok".into_response())
}

fn entry_path(state: &AppState, page: &str, date: &str) -> AppResult<PathBuf> {
    let page = page.trim();
    if page.is_empty() {
        return Ok(state
            .config
            .vault_path
            .join(&state.config.daily_dir)
            .join(format!("{date}.md")));
    }
    if is_todo_page(page) {
        return Ok(state.config.vault_path.join(&state.config.todo_path));
    }
    let rel = normalize_markdown_rel(page, true)?;
    Ok(state
        .config
        .vault_path
        .join(&state.config.entry_dir)
        .join(rel))
}

fn entry_body_markdown(
    vault_path: &Path,
    page: &str,
    links: &str,
    text: &str,
) -> AppResult<String> {
    let mut body = String::new();
    let links = links
        .split(',')
        .map(str::trim)
        .filter(|link| !link.is_empty())
        .map(|link| format!("[[{link}]]"))
        .collect::<Vec<_>>()
        .join(" ");
    if !links.is_empty() {
        body.push_str(&format!("Links: {links}\n"));
    }

    let linked_text = auto_link_note_titles(vault_path, text.trim())?;
    let text = if is_todo_page(page) {
        format!("- [ ] {linked_text}")
    } else {
        linked_text
    };
    body.push_str(&text);
    Ok(body)
}

fn entry_body_already_exists(existing: &str, body: &str) -> bool {
    let body = body.trim();
    !body.is_empty() && existing.contains(body)
}

pub(crate) async fn mark_todo(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MarkQuery>,
) -> AppResult<Response> {
    let Some(index) = query.index else {
        return Ok((StatusCode::BAD_REQUEST, "missing index").into_response());
    };
    let path = state.config.vault_path.join(&state.config.todo_path);
    ensure_inside(&state.config.vault_path, &path)?;
    let content = fs::read_to_string(&path).unwrap_or_default();

    if let Some(updated) = mark_todo_content(&content, index) {
        fs::write(&path, &updated)?;
        state.markdown_index.update_path(&path, updated)?;
        state.maybe_git_sync();
        Ok("done".into_response())
    } else {
        Ok((StatusCode::NOT_FOUND, "not found").into_response())
    }
}

fn is_todo_page(page: &str) -> bool {
    page.trim().eq_ignore_ascii_case("todo")
}

fn vault_rel_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use super::{
        append_rss_annotation_markdown, ensure_image_preview, entry_body_already_exists,
        entry_timestamp, new_rss_annotation_markdown, normalize_annotation_text, rel_to_vault,
        resolve_attachment_path, rss_annotation_highlight_count, rss_annotation_item_markdown,
        sanitize_annotation_filename,
    };
    use crate::rss::RssItemDetail;

    #[test]
    fn entry_body_duplicate_check_uses_visible_content() {
        let existing = "\n## 12:30\nLinks: [[A]] [[B]]\nhello world\n";
        assert!(entry_body_already_exists(
            existing,
            "Links: [[A]] [[B]]\nhello world"
        ));
        assert!(!entry_body_already_exists(existing, ""));
        assert!(!entry_body_already_exists(existing, "different"));
    }

    #[test]
    fn entry_timestamp_prefers_client_created_at() {
        let timestamp =
            entry_timestamp(Some("2026-06-04T09:08:07+08:00"), Some("1780000000000-old"));

        assert_eq!(
            timestamp.timestamp_millis(),
            chrono::DateTime::parse_from_rfc3339("2026-06-04T09:08:07+08:00")
                .unwrap()
                .timestamp_millis()
        );
    }

    #[test]
    fn entry_timestamp_uses_sync_id_for_legacy_outbox_items() {
        let timestamp = entry_timestamp(None, Some("1780527607000-old"));

        assert_eq!(timestamp.timestamp_millis(), 1_780_527_607_000);
    }

    #[test]
    fn rss_annotation_markdown_matches_existing_highlight_shape() {
        let item = test_rss_item();
        let now = chrono::Local::now();
        let annotation = rss_annotation_item_markdown(
            &item,
            "值得后续展开。",
            Some("Selected text\nfrom the article"),
            &now,
            "https://example.test/post",
        );
        let content = new_rss_annotation_markdown(
            &item,
            "https://example.test/post",
            "abc123",
            "2026-05-26T00:00:00Z",
            &now,
            &annotation,
        );

        assert!(content.contains("doc_type: hypothesis-highlights"));
        assert!(content.contains("source: 'obr-rss'"));
        assert!(content.contains("highlight_count: 1"));
        assert!(content.contains("## Highlights"));
        assert!(content.contains("- Selected text from the article - [Updated on "));
        assert!(content.contains("  - Note: 值得后续展开。"));
        assert_eq!(rss_annotation_highlight_count(&content), 1);
    }

    #[test]
    fn rss_annotation_append_updates_count_and_timestamp() {
        let existing = "---\nhighlight_count: 1\nupdated_at: 'old'\n---\n\n## Highlights\n- A\n";
        let updated = append_rss_annotation_markdown(
            existing,
            "2026-05-26T00:00:00Z",
            "- B\n  - Note: note\n",
        );

        assert!(updated.contains("highlight_count: 2"));
        assert!(updated.contains("updated_at: '2026-05-26T00:00:00Z'"));
        assert_eq!(rss_annotation_highlight_count(&updated), 2);
    }

    #[test]
    fn rss_annotation_text_and_filename_are_normalized() {
        assert_eq!(normalize_annotation_text(" a\n\tb  c ", 20), "a b c");
        assert_eq!(
            sanitize_annotation_filename(" Bad / File: Name? "),
            "Bad-File-Name"
        );
        assert_eq!(sanitize_annotation_filename("///"), "RSS-annotation");
    }

    #[test]
    fn ensure_image_preview_writes_smaller_jpeg() {
        let dir = std::env::temp_dir().join(format!("obr-preview-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let source = dir.join("source.png");
        let preview = dir.join("preview.jpg");
        let image = ::image::RgbImage::from_fn(1200, 800, |x, y| {
            ::image::Rgb([(x % 255) as u8, (y % 255) as u8, 120])
        });
        image.save(&source).unwrap();

        ensure_image_preview(&source, &preview, 600, 72).unwrap();

        let generated = ::image::open(&preview).unwrap();
        assert_eq!(generated.width(), 600);
        assert_eq!(generated.height(), 400);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn resolve_attachment_path_finds_svg_by_obsidian_filename() {
        let vault =
            std::env::temp_dir().join(format!("obr-attachment-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(vault.join("Pics")).unwrap();
        fs::write(vault.join("Pics").join("diagram.svg"), "<svg></svg>").unwrap();

        let path = resolve_attachment_path(&vault, Path::new("Pics"), Path::new("diagram.svg"))
            .unwrap()
            .unwrap();

        let canonical_vault = vault.canonicalize().unwrap();
        assert_eq!(
            rel_to_vault(&canonical_vault, &path).unwrap(),
            "Pics/diagram.svg"
        );
        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn resolve_attachment_path_accepts_vault_relative_image_paths() {
        let vault =
            std::env::temp_dir().join(format!("obr-attachment-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(vault.join("Pics")).unwrap();
        fs::write(vault.join("Pics").join("photo.jpg"), "fake").unwrap();

        let path = resolve_attachment_path(&vault, Path::new("Pics"), Path::new("Pics/photo.jpg"))
            .unwrap()
            .unwrap();

        let canonical_vault = vault.canonicalize().unwrap();
        assert_eq!(
            rel_to_vault(&canonical_vault, &path).unwrap(),
            "Pics/photo.jpg"
        );
        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn resolve_attachment_path_falls_back_to_vault_wide_filename_lookup() {
        let vault =
            std::env::temp_dir().join(format!("obr-attachment-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(vault.join("Assets")).unwrap();
        fs::create_dir_all(vault.join("Pics")).unwrap();
        fs::write(vault.join("Assets").join("diagram.svg"), "<svg></svg>").unwrap();

        let path = resolve_attachment_path(&vault, Path::new("Pics"), Path::new("diagram.svg"))
            .unwrap()
            .unwrap();

        let canonical_vault = vault.canonicalize().unwrap();
        assert_eq!(
            rel_to_vault(&canonical_vault, &path).unwrap(),
            "Assets/diagram.svg"
        );
        let _ = fs::remove_dir_all(vault);
    }

    fn test_rss_item() -> RssItemDetail {
        RssItemDetail {
            id: "rss-item".to_string(),
            feed_id: "feed".to_string(),
            feed_title: "Example Feed".to_string(),
            feed_url: "https://example.test/feed.xml".to_string(),
            title: "Example RSS Post".to_string(),
            url: "https://example.test/post".to_string(),
            author: Some("Example Author".to_string()),
            published_at: None,
            updated_at: None,
            first_seen_at: "2026-05-26T00:00:00Z".to_string(),
            fetched_at: None,
            read_at: None,
            starred_at: None,
            ai_summary_zh: None,
            ai_summary_model: None,
            ai_summary_at: None,
            ai_translation_md: None,
            ai_translation_model: None,
            ai_translation_at: None,
            ai_enrichment_error: None,
            ai_enrichment_failed_at: None,
            ai_enrichment_next_attempt_at: None,
            needs_translation: true,
            hacker_news_url: None,
            content_source: "summary".to_string(),
            extraction_quality: None,
            content_path: None,
            content_markdown: "Body".to_string(),
            html_path: None,
            source_html_path: None,
        }
    }
}
