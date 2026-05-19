use std::{
    collections::HashMap,
    io::{self, Read},
    sync::Mutex,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, anyhow, bail};
use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use subtle::ConstantTimeEq;
use tower_sessions::{Expiry, MemoryStore, Session, SessionManagerLayer, cookie::SameSite};

use crate::{
    config::Config,
    error::{AppError, AppResult},
};

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

pub(crate) async fn ensure_auth(session: &Session) -> AppResult<()> {
    if is_authenticated(session).await? {
        Ok(())
    } else {
        Err(AppError::unauthorized())
    }
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

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use argon2::password_hash::SaltString;
    use tower_sessions::cookie::time::Duration as CookieDuration;

    use super::*;

    fn test_config(password_hash: Option<String>, password: Option<String>) -> Config {
        Config {
            listen: "127.0.0.1:8010".to_string(),
            vault_path: PathBuf::from("."),
            log_path: PathBuf::from("logs/obr.log"),
            username: "admin".to_string(),
            password_hash,
            password,
            allow_plaintext_password: false,
            session_days: 21,
            secure_cookies: false,
            auto_git_sync: false,
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
}
