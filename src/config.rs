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
    pub(crate) username: String,
    #[serde(default)]
    pub(crate) password_hash: Option<String>,
    #[serde(default)]
    pub(crate) password: Option<String>,
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
        if config.vault_path.is_relative() {
            config.vault_path = std::env::current_dir()?.join(config.vault_path);
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
