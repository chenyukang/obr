use std::{net::SocketAddr, sync::Arc};

use axum::{
    body::Body,
    extract::State,
    http::{
        HeaderMap, Method, Request, StatusCode,
        header::{HOST, ORIGIN},
    },
    middleware::Next,
    response::{IntoResponse, Response},
};
use tracing::warn;

use crate::{app::AppState, config::Config};

const SEC_FETCH_SITE_HEADER: &str = "sec-fetch-site";

pub(crate) async fn guard(
    State(state): State<Arc<AppState>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if let Err(message) =
        validate_request_origin(&state.config, request.method(), request.headers())
    {
        warn!(method = %request.method(), uri = %request.uri(), error = message, "blocked request origin");
        return (StatusCode::FORBIDDEN, message).into_response();
    }
    next.run(request).await
}

fn validate_request_origin(
    config: &Config,
    method: &Method,
    headers: &HeaderMap,
) -> Result<(), &'static str> {
    if !host_allowed(config, headers) {
        return Err("request host is not allowed");
    }
    if !method_is_state_changing(method) {
        return Ok(());
    }
    if let Some(site) = headers
        .get(SEC_FETCH_SITE_HEADER)
        .and_then(|value| value.to_str().ok())
        && matches!(site, "cross-site" | "none")
    {
        return Err("cross-site request is not allowed");
    }
    if let Some(origin) = headers.get(ORIGIN).and_then(|value| value.to_str().ok())
        && !origin_allowed(config, origin)
    {
        return Err("request origin is not allowed");
    }
    Ok(())
}

fn method_is_state_changing(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    )
}

fn host_allowed(config: &Config, headers: &HeaderMap) -> bool {
    let Some(host) = headers.get(HOST).and_then(|value| value.to_str().ok()) else {
        return false;
    };
    let Some(host) = normalize_host(host) else {
        return false;
    };
    allowed_hosts(config)
        .into_iter()
        .any(|allowed| allowed == host)
}

fn origin_allowed(config: &Config, origin: &str) -> bool {
    let Ok(origin) = url::Url::parse(origin) else {
        return false;
    };
    let Some(origin) = normalize_origin(&origin) else {
        return false;
    };
    allowed_origins(config)
        .into_iter()
        .any(|allowed| allowed == origin)
}

fn allowed_hosts(config: &Config) -> Vec<String> {
    let mut hosts = Vec::new();
    if let Ok(origin) = config.webauthn_origin() {
        add_origin_hosts(&mut hosts, &origin);
    }
    if let Ok(listen) = config.listen.parse::<SocketAddr>()
        && listen.ip().is_loopback()
    {
        add_host_with_optional_port(&mut hosts, "localhost", listen.port());
        add_host_with_optional_port(&mut hosts, "127.0.0.1", listen.port());
        add_host_with_optional_port(&mut hosts, "[::1]", listen.port());
    }
    hosts.sort();
    hosts.dedup();
    hosts
}

fn allowed_origins(config: &Config) -> Vec<String> {
    let mut origins = Vec::new();
    if let Ok(origin) = config.webauthn_origin()
        && let Some(origin) = normalize_origin(&origin)
    {
        origins.push(origin);
    }
    if let Ok(listen) = config.listen.parse::<SocketAddr>()
        && listen.ip().is_loopback()
    {
        let port = listen.port();
        origins.push(format!("http://localhost:{port}"));
        origins.push(format!("http://127.0.0.1:{port}"));
        origins.push(format!("http://[::1]:{port}"));
    }
    origins.sort();
    origins.dedup();
    origins
}

fn add_origin_hosts(hosts: &mut Vec<String>, origin: &url::Url) {
    let Some(host) = origin_host(origin) else {
        return;
    };
    hosts.push(host.clone());
    if let Some(port) = origin.port_or_known_default() {
        hosts.push(format!("{host}:{port}"));
    }
}

fn add_host_with_optional_port(hosts: &mut Vec<String>, host: &str, port: u16) {
    hosts.push(host.to_string());
    hosts.push(format!("{host}:{port}"));
}

fn normalize_origin(origin: &url::Url) -> Option<String> {
    let scheme = origin.scheme();
    if !matches!(scheme, "http" | "https") {
        return None;
    }
    let host = origin_host(origin)?;
    let port = origin.port_or_known_default()?;
    Some(format!("{scheme}://{host}:{port}"))
}

fn origin_host(origin: &url::Url) -> Option<String> {
    let host = origin
        .host_str()?
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host.is_empty() {
        return None;
    }
    if host.contains(':') && !host.starts_with('[') {
        Some(format!("[{host}]"))
    } else {
        Some(host)
    }
}

fn normalize_host(host: &str) -> Option<String> {
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() || host.contains('/') || host.contains('@') {
        None
    } else {
        Some(host)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use axum::http::HeaderValue;

    use super::*;

    fn test_config() -> Config {
        Config {
            listen: "127.0.0.1:8010".to_string(),
            vault_path: PathBuf::from("."),
            daily_dir: PathBuf::from("Daily"),
            entry_dir: PathBuf::from("Posts"),
            image_dir: PathBuf::from("Pics"),
            todo_path: PathBuf::from("Posts/todo.md"),
            log_path: PathBuf::from("logs/obr.log"),
            log_level: "info".to_string(),
            username: "admin".to_string(),
            password_hash: None,
            password: Some("secret".to_string()),
            allow_plaintext_password: true,
            session_days: 21,
            secure_cookies: false,
            auto_git_sync: false,
            passkey_store_path: PathBuf::from("data/passkeys.json"),
            webauthn_rp_name: "Obr".to_string(),
            webauthn_rp_id: None,
            webauthn_origin: None,
            rss_enabled: false,
            rss_feeds_path: PathBuf::from("Zero/feeds.md"),
            rss_data_dir: PathBuf::from("data/rss"),
            rss_refresh_minutes: 30,
            rss_max_items_per_feed: 20,
            rss_fetch_full_content: true,
            rss_ai_summary_enabled: true,
            rss_ai_summary_chars: 200,
            deepseek_api_key: None,
            deepseek_api_base: "https://api.deepseek.com".to_string(),
            deepseek_model: "deepseek-v4-flash".to_string(),
        }
    }

    #[test]
    fn origin_guard_allows_loopback_origins() {
        let config = test_config();
        let mut headers = HeaderMap::new();
        headers.insert(HOST, HeaderValue::from_static("127.0.0.1:8010"));
        headers.insert(ORIGIN, HeaderValue::from_static("http://127.0.0.1:8010"));

        assert!(validate_request_origin(&config, &Method::POST, &headers).is_ok());
    }

    #[test]
    fn origin_guard_rejects_cross_site_fetch_metadata() {
        let config = test_config();
        let mut headers = HeaderMap::new();
        headers.insert(HOST, HeaderValue::from_static("localhost:8010"));
        headers.insert(
            SEC_FETCH_SITE_HEADER,
            HeaderValue::from_static("cross-site"),
        );

        assert!(validate_request_origin(&config, &Method::POST, &headers).is_err());
    }

    #[test]
    fn origin_guard_rejects_untrusted_origin() {
        let config = test_config();
        let mut headers = HeaderMap::new();
        headers.insert(HOST, HeaderValue::from_static("localhost:8010"));
        headers.insert(ORIGIN, HeaderValue::from_static("https://evil.example"));

        assert!(validate_request_origin(&config, &Method::POST, &headers).is_err());
    }

    #[test]
    fn origin_guard_rejects_untrusted_host_even_for_get() {
        let config = test_config();
        let mut headers = HeaderMap::new();
        headers.insert(HOST, HeaderValue::from_static("evil.example"));

        assert!(validate_request_origin(&config, &Method::GET, &headers).is_err());
    }

    #[test]
    fn origin_guard_allows_configured_https_origin() {
        let mut config = test_config();
        config.listen = "0.0.0.0:8010".to_string();
        config.secure_cookies = true;
        config.webauthn_rp_id = Some("obr.example.com".to_string());
        let mut headers = HeaderMap::new();
        headers.insert(HOST, HeaderValue::from_static("obr.example.com"));
        headers.insert(ORIGIN, HeaderValue::from_static("https://obr.example.com"));

        assert!(validate_request_origin(&config, &Method::POST, &headers).is_ok());
    }
}
