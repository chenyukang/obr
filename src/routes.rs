use std::{fs, sync::Arc};

use anyhow::Context;
use axum::{
    Json,
    extract::{Path as AxumPath, Query, State},
    http::{
        StatusCode,
        header::{CACHE_CONTROL, CONTENT_TYPE, HeaderValue},
    },
    response::{Html, IntoResponse, Response},
};
use chrono::Local;
use serde::Deserialize;
use tower_sessions::Session;

use crate::{
    app::AppState,
    auth::{AUTH_SESSION_KEY, ensure_auth, is_authenticated, verify_login},
    error::AppResult,
    markdown::{
        ensure_inside, escape_html, escape_html_attr, mark_todo_content, normalize_markdown_rel,
        normalize_rel_path, random_markdown_file, rel_to_vault, resolve_markdown_request,
        save_data_url_image, search_markdown,
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

pub(crate) async fn index() -> Html<&'static str> {
    Html(include_str!("../static/index.html"))
}

pub(crate) async fn login(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(body): Json<LoginRequest>,
) -> AppResult<Response> {
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

pub(crate) async fn logout(session: Session) -> AppResult<Response> {
    session.delete().await?;
    Ok("ok".into_response())
}

pub(crate) async fn verify(session: Session) -> AppResult<Response> {
    if is_authenticated(&session).await? {
        Ok("ok".into_response())
    } else {
        Ok((StatusCode::UNAUTHORIZED, "unauthorized").into_response())
    }
}

pub(crate) async fn get_page(
    State(state): State<Arc<AppState>>,
    session: Session,
    Query(query): Query<PageQuery>,
) -> AppResult<Response> {
    ensure_auth(&session).await?;

    state.maybe_git_pull();
    let requested = match query.query_type.as_deref() {
        Some("rand") => match random_markdown_file(&state.config.vault_path)? {
            Some(path) => path,
            None => return Ok(Json(vec!["NoPage".to_string(), String::new()]).into_response()),
        },
        _ => resolve_markdown_request(&state.config.vault_path, &query.path.unwrap_or_default())?,
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

pub(crate) async fn post_page(
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

pub(crate) async fn search(
    State(state): State<Arc<AppState>>,
    session: Session,
    Query(query): Query<SearchQuery>,
) -> AppResult<Response> {
    ensure_auth(&session).await?;
    state.maybe_git_pull();

    let keyword = query.keyword.unwrap_or_default();
    let hits = search_markdown(&state.config.vault_path, &keyword)?;
    let mut body = String::new();
    for path in hits {
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

pub(crate) async fn image(
    State(state): State<Arc<AppState>>,
    session: Session,
    AxumPath(path): AxumPath<String>,
) -> AppResult<Response> {
    ensure_auth(&session).await?;

    let rel = normalize_rel_path(&path)?;
    let images_root = state.config.vault_path.join("Pics").canonicalize()?;
    let path = images_root.join(rel);
    ensure_inside(&images_root, &path)?;
    if !path.is_file() {
        return Ok((StatusCode::NOT_FOUND, "not found").into_response());
    }

    let bytes = fs::read(&path).with_context(|| format!("read image {}", path.display()))?;
    let content_type = mime_guess::from_path(&path).first_or_octet_stream();
    let mut response = bytes.into_response();
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_str(content_type.as_ref())?);
    response.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=3600"),
    );
    Ok(response)
}

pub(crate) async fn post_entry(
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

pub(crate) async fn mark_todo(
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

    if let Some(updated) = mark_todo_content(&content, index) {
        fs::write(&path, updated)?;
        state.maybe_git_sync();
        Ok("done".into_response())
    } else {
        Ok((StatusCode::NOT_FOUND, "not found").into_response())
    }
}
