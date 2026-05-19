use std::io::{self, Read};

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
            username: "admin".to_string(),
            password_hash,
            password,
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
}
