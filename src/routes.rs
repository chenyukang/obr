use std::{
    fs,
    sync::Arc,
    time::{Instant, UNIX_EPOCH},
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
use chrono::Local;
use serde::{Deserialize, Serialize};
use tower_sessions::Session;
use tracing::info;
use webauthn_rs::prelude::{
    PasskeyAuthentication, PasskeyRegistration, PublicKeyCredential, RegisterPublicKeyCredential,
};

use crate::{
    app::AppState,
    auth::{AUTH_SESSION_KEY, allows_local_password_login, verify_login},
    error::{AppError, AppResult},
    markdown::{
        auto_link_note_titles, ensure_inside, escape_html, escape_html_attr, mark_todo_content,
        normalize_markdown_rel, normalize_rel_path, rel_to_vault, render_markdown_html,
        save_data_url_image, save_image_bytes,
    },
};

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
pub(crate) struct PageUpdate {
    file: String,
    content: String,
}

#[derive(Deserialize)]
pub(crate) struct EntryRequest {
    page: String,
    links: String,
    text: String,
    image: String,
}

#[derive(Deserialize)]
pub(crate) struct MarkQuery {
    index: Option<usize>,
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
    html: String,
}

#[derive(Serialize)]
struct PageSourceResponse {
    file: String,
    content: String,
}

#[derive(Serialize)]
struct PingResponse {
    ok: bool,
}

const PASSKEY_REGISTRATION_SESSION_KEY: &str = "passkey_registration";
const PASSKEY_AUTHENTICATION_SESSION_KEY: &str = "passkey_authentication";
const MAX_ENTRY_IMAGE_BYTES: usize = 5 * 1024 * 1024;

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

pub(crate) async fn get_page(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PageQuery>,
) -> AppResult<Response> {
    let started = Instant::now();
    let requested_path = query.path.clone().unwrap_or_default();
    let query_type = query.query_type.clone().unwrap_or_default();
    let Some((rel, content)) = read_page_content(&state, query)? else {
        info!(
            api = "page",
            path = %requested_path,
            query_type = %query_type,
            found = false,
            elapsed_ms = started.elapsed().as_millis(),
            "api timing"
        );
        return Ok(Json(PageResponse {
            file: "NoPage".to_string(),
            html: String::new(),
        })
        .into_response());
    };
    let render_started = Instant::now();
    let html = render_markdown_html(&content);
    info!(
        api = "page",
        path = %requested_path,
        query_type = %query_type,
        file = %rel,
        found = true,
        bytes = content.len(),
        render_ms = render_started.elapsed().as_millis(),
        elapsed_ms = started.elapsed().as_millis(),
        "api timing"
    );
    Ok(Json(PageResponse { file: rel, html }).into_response())
}

pub(crate) async fn get_page_source(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PageQuery>,
) -> AppResult<Response> {
    let started = Instant::now();
    let requested_path = query.path.clone().unwrap_or_default();
    let query_type = query.query_type.clone().unwrap_or_default();
    let Some((rel, content)) = read_page_content(&state, query)? else {
        info!(
            api = "page_source",
            path = %requested_path,
            query_type = %query_type,
            found = false,
            elapsed_ms = started.elapsed().as_millis(),
            "api timing"
        );
        return Ok(Json(PageSourceResponse {
            file: "NoPage".to_string(),
            content: String::new(),
        })
        .into_response());
    };
    info!(
        api = "page_source",
        path = %requested_path,
        query_type = %query_type,
        file = %rel,
        found = true,
        bytes = content.len(),
        elapsed_ms = started.elapsed().as_millis(),
        "api timing"
    );
    Ok(Json(PageSourceResponse { file: rel, content }).into_response())
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
    fs::write(&path, &body.content).with_context(|| format!("write {}", path.display()))?;
    state
        .markdown_index
        .update_path(&path, body.content.clone())?;
    state.maybe_git_sync();
    let rel = rel_to_vault(&state.config.vault_path, &path)?;
    Ok(Json(PageResponse {
        file: rel,
        html: render_markdown_html(&body.content),
    })
    .into_response())
}

fn read_page_content(state: &AppState, query: PageQuery) -> AppResult<Option<(String, String)>> {
    state.maybe_git_pull();
    let requested = match query.query_type.as_deref() {
        Some("rand") => match state.markdown_index.random_file()? {
            Some(path) => path,
            None => return Ok(None),
        },
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
    let started = Instant::now();
    state.maybe_git_pull();
    let after_sync = Instant::now();

    let keyword = query.keyword.unwrap_or_default();
    let search_started = Instant::now();
    let page = query.page.unwrap_or_default();
    let results = state.markdown_index.search_page(&keyword, page)?;
    let search_ms = search_started.elapsed().as_millis();
    let total_matches = results.total_matches;
    let offset = results.offset;
    let limit = results.limit;
    let returned_hits = results.paths.len();
    let render_started = Instant::now();
    let mut body = String::new();
    for path in results.paths {
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
    let shown = offset.saturating_add(returned_hits);
    if shown < total_matches {
        body.push_str(&format!(
            "<li class=\"search-more-row\"><button class=\"search-more\" type=\"button\" data-search-page=\"{}\">More <span>{} / {}</span></button></li>",
            page.saturating_add(1), shown, total_matches
        ));
    }
    info!(
        api = "search",
        keyword = %keyword,
        page,
        offset,
        limit,
        hits = returned_hits,
        total_matches,
        sync_ms = after_sync.duration_since(started).as_millis(),
        search_ms,
        render_ms = render_started.elapsed().as_millis(),
        elapsed_ms = started.elapsed().as_millis(),
        "api timing"
    );
    Ok(Html(body).into_response())
}

pub(crate) async fn image(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    AxumPath(path): AxumPath<String>,
) -> AppResult<Response> {
    let rel = normalize_rel_path(&path)?;
    let images_root = state.config.vault_path.join("Pics").canonicalize()?;
    let path = images_root.join(rel);
    ensure_inside(&images_root, &path)?;
    if !path.is_file() {
        return Ok((StatusCode::NOT_FOUND, "not found").into_response());
    }

    let metadata = fs::metadata(&path).with_context(|| format!("stat image {}", path.display()))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let etag_value = format!(r#""{}-{}""#, metadata.len(), modified);
    let cache_control = HeaderValue::from_static("private, max-age=2592000, immutable");
    if headers
        .get(IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(',').any(|tag| tag.trim() == etag_value))
    {
        let mut response = StatusCode::NOT_MODIFIED.into_response();
        response.headers_mut().insert(CACHE_CONTROL, cache_control);
        response
            .headers_mut()
            .insert(ETAG, HeaderValue::from_str(&etag_value)?);
        return Ok(response);
    }

    let bytes = fs::read(&path).with_context(|| format!("read image {}", path.display()))?;
    let content_type = mime_guess::from_path(&path).first_or_octet_stream();
    let mut response = bytes.into_response();
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_str(content_type.as_ref())?);
    response.headers_mut().insert(CACHE_CONTROL, cache_control);
    response
        .headers_mut()
        .insert(ETAG, HeaderValue::from_str(&etag_value)?);
    Ok(response)
}

pub(crate) async fn post_entry(
    State(state): State<Arc<AppState>>,
    Json(body): Json<EntryRequest>,
) -> AppResult<Response> {
    let image_name = if body.image.trim().is_empty() {
        None
    } else {
        Some(save_data_url_image(
            &state.config.vault_path,
            &body.image,
            &Local::now(),
        )?)
    };
    write_entry(
        state,
        EntryPayload {
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
    let now = Local::now();
    let mut page = String::new();
    let mut links = String::new();
    let mut text = String::new();
    let mut image_name = None;

    while let Some(field) = multipart.next_field().await.map_err(anyhow::Error::from)? {
        let name = field.name().unwrap_or_default().to_string();
        match name.as_str() {
            "page" => page = field.text().await.map_err(anyhow::Error::from)?,
            "links" => links = field.text().await.map_err(anyhow::Error::from)?,
            "text" => text = field.text().await.map_err(anyhow::Error::from)?,
            "image" => {
                let content_type = field
                    .content_type()
                    .map(str::to_owned)
                    .unwrap_or_else(|| "image/jpeg".to_string());
                let file_name = field.file_name().map(str::to_owned);
                let image_type = normalize_multipart_image_type(&content_type, file_name.as_deref());
                let bytes = field.bytes().await.map_err(anyhow::Error::from)?;
                if bytes.len() > MAX_ENTRY_IMAGE_BYTES {
                    return Ok((StatusCode::PAYLOAD_TOO_LARGE, "image too large").into_response());
                }
                if !bytes.is_empty() {
                    image_name = Some(save_image_bytes(
                        &state.config.vault_path,
                        &bytes,
                        &image_type,
                        &now,
                    )?);
                }
            }
            _ => {}
        }
    }

    write_entry(
        state,
        EntryPayload {
            page,
            links,
            text,
            image_name,
        },
    )
}

struct EntryPayload {
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
            .and_then(|name| name.rsplit_once('.').map(|(_, ext)| ext.to_ascii_lowercase()))
            .unwrap_or_else(|| "jpg".to_string()),
    }
}

fn write_entry(state: Arc<AppState>, body: EntryPayload) -> AppResult<Response> {
    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M").to_string();

    let page = body.page.trim();
    if page.is_empty()
        && body.links.trim().is_empty()
        && body.text.trim().is_empty()
        && body.image_name.is_none()
    {
        return Ok((StatusCode::BAD_REQUEST, "empty post").into_response());
    }

    let path = if page.is_empty() {
        state
            .config
            .vault_path
            .join("Daily")
            .join(format!("{date}.md"))
    } else {
        let rel = normalize_markdown_rel(&format!("Zero/{page}"), true)?;
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

    let linked_text = auto_link_note_titles(&state.config.vault_path, body.text.trim())?;
    let text = if page == "todo" {
        format!("- [ ] {linked_text}")
    } else {
        linked_text
    };
    appended.push('\n');
    appended.push_str(&text);

    if let Some(image_name) = body.image_name {
        appended.push_str(&format!("\n\n![[{image_name}|250]]\n"));
    }

    let content = if page == "todo" {
        format!("{appended}\n\n---\n\n{existing}")
    } else {
        format!("{existing}\n{appended}")
    };
    fs::write(&path, &content).with_context(|| format!("write {}", path.display()))?;
    state.markdown_index.update_path(&path, content)?;
    state.maybe_git_sync();
    Ok("ok".into_response())
}

pub(crate) async fn mark_todo(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MarkQuery>,
) -> AppResult<Response> {
    let Some(index) = query.index else {
        return Ok((StatusCode::BAD_REQUEST, "missing index").into_response());
    };
    let path = state.config.vault_path.join("Zero").join("todo.md");
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
