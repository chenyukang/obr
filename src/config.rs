use std::{
    fs,
    net::SocketAddr,
    path::{Path, PathBuf},
};

use anyhow::{Result, anyhow, bail};
use argon2::PasswordHash;
use serde::Deserialize;
use tower_sessions::cookie::time::Duration as CookieDuration;
use tracing::warn;

const DEFAULT_SESSION_DAYS: u64 = 21;
const SECONDS_PER_DAY: u64 = 24 * 60 * 60;

#[derive(Clone, Deserialize)]
pub(crate) struct Config {
    pub(crate) listen: String,
    pub(crate) vault_path: PathBuf,
    #[serde(default = "default_log_path")]
    pub(crate) log_path: PathBuf,
    pub(crate) username: String,
    #[serde(default)]
    pub(crate) password_hash: Option<String>,
    #[serde(default)]
    pub(crate) password: Option<String>,
    #[serde(default)]
    pub(crate) allow_plaintext_password: bool,
    #[serde(default = "default_session_days")]
    pub(crate) session_days: u64,
    #[serde(default)]
    pub(crate) secure_cookies: bool,
    #[serde(default)]
    pub(crate) auto_git_sync: bool,
}

fn default_session_days() -> u64 {
    DEFAULT_SESSION_DAYS
}

fn default_log_path() -> PathBuf {
    PathBuf::from("logs/obr.log")
}

impl Config {
    pub(crate) fn load() -> Result<Self> {
        let path = if Path::new("config/local.toml").exists() {
            Path::new("config/local.toml")
        } else {
            Path::new("config.example.toml")
        };
        let raw =
            fs::read_to_string(path).map_err(|err| anyhow!("read {}: {err}", path.display()))?;
        let mut config: Config =
            toml::from_str(&raw).map_err(|err| anyhow!("parse {}: {err}", path.display()))?;
        let cwd = std::env::current_dir()?;
        if config.vault_path.is_relative() {
            config.vault_path = cwd.join(config.vault_path);
        }
        if config.log_path.is_relative() {
            config.log_path = cwd.join(config.log_path);
        }
        config.vault_path = config.vault_path.canonicalize().map_err(|err| {
            anyhow!(
                "vault path does not exist or cannot be resolved: {}: {err}",
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
        if self.log_path.as_os_str().is_empty() {
            bail!("log_path cannot be empty");
        }
        match (&self.password_hash, &self.password) {
            (Some(hash), _) => {
                PasswordHash::new(hash)
                    .map_err(|err| anyhow!("invalid password_hash in config: {err}"))?;
                if self.password.is_some() {
                    warn!("both password_hash and password are configured; password is ignored");
                }
            }
            (None, Some(_)) if self.allow_plaintext_password => {
                warn!(
                    "config uses plaintext password; pipe the password into `./target/release/obr hash-password` and set password_hash instead"
                );
            }
            (None, Some(_)) => {
                bail!(
                    "plaintext password is disabled; configure password_hash, or set allow_plaintext_password = true for local development only"
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

    pub(crate) fn session_duration(&self) -> CookieDuration {
        let max_days = (i64::MAX as u64) / SECONDS_PER_DAY;
        CookieDuration::days(self.session_days.min(max_days) as i64)
    }

    fn is_loopback_listen(&self) -> bool {
        self.listen
            .parse::<SocketAddr>()
            .map(|addr| addr.ip().is_loopback())
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> Config {
        Config {
            listen: "127.0.0.1:8010".to_string(),
            vault_path: PathBuf::from("."),
            log_path: PathBuf::from("logs/obr.log"),
            username: "admin".to_string(),
            password_hash: None,
            password: Some("secret".to_string()),
            allow_plaintext_password: false,
            session_days: 21,
            secure_cookies: false,
            auto_git_sync: false,
        }
    }

    #[test]
    fn plaintext_password_is_rejected_by_default() {
        let config = test_config();

        assert!(config.validate_auth_config().is_err());
    }

    #[test]
    fn plaintext_password_can_be_explicitly_allowed_for_local_development() {
        let mut config = test_config();
        config.allow_plaintext_password = true;

        assert!(config.validate_auth_config().is_ok());
    }
}
