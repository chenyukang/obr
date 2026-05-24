use std::{
    collections::HashMap,
    io::{self, Read},
    net::IpAddr,
    sync::Mutex,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, anyhow, bail};
use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use axum::http::{HeaderMap, header::HOST};
use subtle::ConstantTimeEq;
use tower_sessions::{Expiry, MemoryStore, Session, SessionManagerLayer, cookie::SameSite};

use crate::config::Config;

pub(crate) const AUTH_SESSION_KEY: &str = "authenticated";
const MAX_FAILED_LOGINS: u32 = 5;
const LOGIN_LOCKOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
pub(crate) struct LoginLimiter {
    attempts: Mutex<HashMap<String, LoginAttempt>>,
}

#[derive(Clone, Copy)]
struct LoginAttempt {
    failures: u32,
    locked_until: Option<Instant>,
}

impl LoginLimiter {
    pub(crate) fn is_allowed(&self, key: &str) -> bool {
        let mut attempts = self.attempts.lock().expect("login limiter lock poisoned");
        let Some(attempt) = attempts.get_mut(key) else {
            return true;
        };
        if let Some(locked_until) = attempt.locked_until {
            if locked_until > Instant::now() {
                return false;
            }
            attempt.failures = 0;
            attempt.locked_until = None;
        }
        true
    }

    pub(crate) fn record_failure(&self, key: &str) {
        let mut attempts = self.attempts.lock().expect("login limiter lock poisoned");
        let attempt = attempts.entry(key.to_string()).or_insert(LoginAttempt {
            failures: 0,
            locked_until: None,
        });
        attempt.failures = attempt.failures.saturating_add(1);
        if attempt.failures >= MAX_FAILED_LOGINS {
            attempt.locked_until = Some(Instant::now() + LOGIN_LOCKOUT);
        }
    }

    pub(crate) fn record_success(&self, key: &str) {
        self.attempts
            .lock()
            .expect("login limiter lock poisoned")
            .remove(key);
    }
}

pub(crate) fn session_layer(config: &Config) -> SessionManagerLayer<MemoryStore> {
    let session_store = MemoryStore::default();
    SessionManagerLayer::new(session_store)
        .with_name("obr.sid")
        .with_http_only(true)
        .with_same_site(SameSite::Strict)
        .with_secure(config.secure_cookies)
        .with_expiry(Expiry::OnInactivity(config.session_duration()))
}

pub(crate) fn print_password_hash_from_stdin() -> Result<()> {
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

pub(crate) async fn is_authenticated(
    session: &Session,
) -> Result<bool, tower_sessions::session::Error> {
    Ok(session
        .get::<bool>(AUTH_SESSION_KEY)
        .await?
        .unwrap_or(false))
}

pub(crate) fn verify_login(config: &Config, username: &str, password: &str) -> bool {
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

pub(crate) fn allows_local_password_login(headers: &HeaderMap) -> bool {
    !has_forwarded_headers(headers) && host_is_loopback(headers)
}

fn has_forwarded_headers(headers: &HeaderMap) -> bool {
    [
        "forwarded",
        "x-forwarded-for",
        "x-forwarded-host",
        "x-forwarded-proto",
        "x-real-ip",
    ]
    .iter()
    .any(|name| headers.contains_key(*name))
}

fn host_is_loopback(headers: &HeaderMap) -> bool {
    let Some(host) = headers.get(HOST).and_then(|value| value.to_str().ok()) else {
        return false;
    };
    host_name(host).is_some_and(|name| {
        name.eq_ignore_ascii_case("localhost")
            || name
                .parse::<IpAddr>()
                .map(|ip| ip.is_loopback())
                .unwrap_or(false)
    })
}

fn host_name(host: &str) -> Option<&str> {
    let host = host.trim().trim_end_matches('.');
    if host.is_empty() {
        return None;
    }
    if let Some(rest) = host.strip_prefix('[') {
        let (addr, _) = rest.split_once(']')?;
        return Some(addr);
    }
    if host.matches(':').count() == 1 {
        return host.rsplit_once(':').map(|(name, _)| name);
    }
    Some(host)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use argon2::password_hash::SaltString;
    use axum::http::HeaderValue;
    use tower_sessions::cookie::time::Duration as CookieDuration;

    use super::*;

    fn test_config(password_hash: Option<String>, password: Option<String>) -> Config {
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
            password_hash,
            password,
            allow_plaintext_password: false,
            session_days: 21,
            secure_cookies: false,
            auto_git_sync: false,
            passkey_store_path: PathBuf::from("data/passkeys.json"),
            webauthn_rp_name: "Obr".to_string(),
            webauthn_rp_id: None,
            webauthn_origin: None,
        }
    }

    #[test]
    fn verify_login_accepts_plaintext_fallback() {
        let config = test_config(None, Some("secret".to_string()));

        assert!(verify_login(&config, "admin", "secret"));
        assert!(!verify_login(&config, "admin", "wrong"));
        assert!(!verify_login(&config, "other", "secret"));
    }

    #[test]
    fn verify_login_accepts_argon2_hash() {
        let salt = SaltString::from_b64("abcdefghijklmnop").unwrap();
        let hash = Argon2::default()
            .hash_password("secret".as_bytes(), &salt)
            .unwrap()
            .to_string();
        let config = test_config(Some(hash), Some("ignored".to_string()));

        assert!(verify_login(&config, "admin", "secret"));
        assert!(!verify_login(&config, "admin", "wrong"));
    }

    #[test]
    fn session_duration_is_capped_for_cookie_api() {
        let mut config = test_config(None, Some("secret".to_string()));
        config.session_days = u64::MAX;

        assert_eq!(
            config.session_duration(),
            CookieDuration::days(i64::MAX / 86_400)
        );
    }

    #[test]
    fn login_limiter_locks_after_repeated_failures() {
        let limiter = LoginLimiter::default();

        for _ in 0..MAX_FAILED_LOGINS {
            assert!(limiter.is_allowed("admin"));
            limiter.record_failure("admin");
        }

        assert!(!limiter.is_allowed("admin"));
    }

    #[test]
    fn login_limiter_success_clears_failures() {
        let limiter = LoginLimiter::default();

        limiter.record_failure("admin");
        limiter.record_success("admin");

        assert!(limiter.is_allowed("admin"));
    }

    #[test]
    fn local_password_login_allows_loopback_hosts_without_proxy_headers() {
        for host in ["localhost:8010", "127.0.0.1:8010", "[::1]:8010"] {
            let mut headers = HeaderMap::new();
            headers.insert(HOST, HeaderValue::from_str(host).unwrap());

            assert!(allows_local_password_login(&headers), "{host}");
        }
    }

    #[test]
    fn local_password_login_rejects_public_hosts() {
        let mut headers = HeaderMap::new();
        headers.insert(HOST, HeaderValue::from_static("obr.example.com"));

        assert!(!allows_local_password_login(&headers));
    }

    #[test]
    fn local_password_login_rejects_forwarded_loopback_host() {
        let mut headers = HeaderMap::new();
        headers.insert(HOST, HeaderValue::from_static("localhost:8010"));
        headers.insert("x-forwarded-for", HeaderValue::from_static("203.0.113.10"));

        assert!(!allows_local_password_login(&headers));
    }

    #[test]
    fn local_password_login_rejects_missing_host() {
        let headers = HeaderMap::new();

        assert!(!allows_local_password_login(&headers));
    }
}
