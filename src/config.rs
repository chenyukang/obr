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
    #[serde(default = "default_daily_dir")]
    pub(crate) daily_dir: PathBuf,
    #[serde(default = "default_entry_dir")]
    pub(crate) entry_dir: PathBuf,
    #[serde(default = "default_image_dir")]
    pub(crate) image_dir: PathBuf,
    #[serde(default = "default_todo_path")]
    pub(crate) todo_path: PathBuf,
    #[serde(default = "default_annotation_dir")]
    pub(crate) annotation_dir: PathBuf,
    #[serde(default = "default_log_path")]
    pub(crate) log_path: PathBuf,
    #[serde(default = "default_log_level")]
    pub(crate) log_level: String,
    #[serde(default)]
    pub(crate) dark_mode_start: Option<String>,
    #[serde(default)]
    pub(crate) dark_mode_end: Option<String>,
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
    #[serde(default = "default_passkey_store_path")]
    pub(crate) passkey_store_path: PathBuf,
    #[serde(default = "default_webauthn_rp_name")]
    pub(crate) webauthn_rp_name: String,
    #[serde(default)]
    pub(crate) webauthn_rp_id: Option<String>,
    #[serde(default)]
    pub(crate) webauthn_origin: Option<String>,
    #[serde(default)]
    pub(crate) rss_enabled: bool,
    #[serde(default = "default_rss_feeds_path")]
    pub(crate) rss_feeds_path: PathBuf,
    #[serde(default = "default_rss_data_dir")]
    pub(crate) rss_data_dir: PathBuf,
    #[serde(default = "default_rss_refresh_minutes")]
    pub(crate) rss_refresh_minutes: u64,
    #[serde(default = "default_rss_max_items_per_feed")]
    pub(crate) rss_max_items_per_feed: usize,
    #[serde(default = "default_rss_fetch_full_content")]
    pub(crate) rss_fetch_full_content: bool,
    #[serde(default = "default_rss_ai_summary_enabled")]
    pub(crate) rss_ai_summary_enabled: bool,
    #[serde(default)]
    pub(crate) rss_ai_full_translation_enabled: bool,
    #[serde(default = "default_rss_ai_summary_chars")]
    pub(crate) rss_ai_summary_chars: usize,
    #[serde(default)]
    pub(crate) deepseek_api_key: Option<String>,
    #[serde(default = "default_deepseek_api_base")]
    pub(crate) deepseek_api_base: String,
    #[serde(default = "default_deepseek_model")]
    pub(crate) deepseek_model: String,
}

fn default_session_days() -> u64 {
    DEFAULT_SESSION_DAYS
}

fn default_log_path() -> PathBuf {
    PathBuf::from("logs/obr.log")
}

fn default_daily_dir() -> PathBuf {
    PathBuf::from("Daily")
}

fn default_entry_dir() -> PathBuf {
    PathBuf::from("Posts")
}

fn default_image_dir() -> PathBuf {
    PathBuf::from("Pics")
}

fn default_todo_path() -> PathBuf {
    PathBuf::from("Posts/todo.md")
}

fn default_annotation_dir() -> PathBuf {
    PathBuf::from("annotations")
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_passkey_store_path() -> PathBuf {
    PathBuf::from("data/passkeys.json")
}

fn default_webauthn_rp_name() -> String {
    "Obr".to_string()
}

fn default_rss_feeds_path() -> PathBuf {
    PathBuf::from("Zero/feeds.md")
}

fn default_rss_data_dir() -> PathBuf {
    PathBuf::from("data/rss")
}

fn default_rss_refresh_minutes() -> u64 {
    30
}

fn default_rss_max_items_per_feed() -> usize {
    20
}

fn default_rss_fetch_full_content() -> bool {
    true
}

fn default_rss_ai_summary_enabled() -> bool {
    true
}

fn default_rss_ai_summary_chars() -> usize {
    200
}

fn default_deepseek_api_base() -> String {
    "https://api.deepseek.com".to_string()
}

fn default_deepseek_model() -> String {
    "deepseek-v4-flash".to_string()
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
        if config.passkey_store_path.is_relative() {
            config.passkey_store_path = cwd.join(config.passkey_store_path);
        }
        if config.rss_data_dir.is_relative() {
            config.rss_data_dir = cwd.join(config.rss_data_dir);
        }
        config.daily_dir = normalize_vault_relative_path(config.daily_dir, "daily_dir", false)?;
        config.entry_dir = normalize_vault_relative_path(config.entry_dir, "entry_dir", false)?;
        config.image_dir = normalize_vault_relative_path(config.image_dir, "image_dir", false)?;
        config.todo_path = normalize_vault_relative_path(config.todo_path, "todo_path", true)?;
        config.annotation_dir =
            normalize_vault_relative_path(config.annotation_dir, "annotation_dir", false)?;
        config.rss_feeds_path =
            normalize_vault_relative_path(config.rss_feeds_path, "rss_feeds_path", true)?;
        config.vault_path = config.vault_path.canonicalize().map_err(|err| {
            anyhow!(
                "vault path does not exist or cannot be resolved: {}: {err}",
                config.vault_path.display()
            )
        })?;
        config.validate_auth_config()?;
        config.validate_dark_mode_config()?;
        Ok(config)
    }

    fn validate_dark_mode_config(&self) -> Result<()> {
        match (&self.dark_mode_start, &self.dark_mode_end) {
            (Some(start), Some(end)) => {
                parse_clock_time(start)
                    .ok_or_else(|| anyhow!("invalid dark_mode_start, expected HH:MM"))?;
                parse_clock_time(end)
                    .ok_or_else(|| anyhow!("invalid dark_mode_end, expected HH:MM"))?;
            }
            (None, None) => {}
            _ => bail!("configure both dark_mode_start and dark_mode_end, or neither"),
        }
        Ok(())
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
        if self.log_level.trim().is_empty() {
            bail!("log_level cannot be empty");
        }
        if self.passkey_store_path.as_os_str().is_empty() {
            bail!("passkey_store_path cannot be empty");
        }
        if self.webauthn_rp_name.trim().is_empty() {
            bail!("webauthn_rp_name cannot be empty");
        }
        if self.rss_enabled {
            if self.rss_refresh_minutes == 0 {
                bail!("rss_refresh_minutes must be greater than 0");
            }
            if self.rss_max_items_per_feed == 0 {
                bail!("rss_max_items_per_feed must be greater than 0");
            }
            if self.rss_data_dir.as_os_str().is_empty() {
                bail!("rss_data_dir cannot be empty");
            }
            if self.rss_ai_summary_enabled && self.rss_ai_summary_chars == 0 {
                bail!("rss_ai_summary_chars must be greater than 0");
            }
            if self.rss_ai_full_translation_enabled && !self.rss_ai_summary_enabled {
                bail!("rss_ai_full_translation_enabled requires rss_ai_summary_enabled = true");
            }
            if self.rss_ai_summary_enabled
                && self
                    .deepseek_api_key
                    .as_deref()
                    .is_some_and(|key| !key.trim().is_empty())
            {
                if self.deepseek_api_base.trim().is_empty() {
                    bail!("deepseek_api_base cannot be empty");
                }
                if self.deepseek_model.trim().is_empty() {
                    bail!("deepseek_model cannot be empty");
                }
            }
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
                    "config uses plaintext password; run `./target/release/obr hash-password` and set password_hash instead"
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

    pub(crate) fn is_loopback_listen(&self) -> bool {
        self.listen
            .parse::<SocketAddr>()
            .map(|addr| addr.ip().is_loopback())
            .unwrap_or(false)
    }

    pub(crate) fn webauthn_origin(&self) -> Result<url::Url> {
        if let Some(origin) = &self.webauthn_origin {
            return url::Url::parse(origin)
                .map_err(|err| anyhow!("invalid webauthn_origin: {err}"));
        }
        if let Some(rp_id) = &self.webauthn_rp_id {
            return url::Url::parse(&format!("https://{rp_id}"))
                .map_err(|err| anyhow!("build webauthn origin from webauthn_rp_id: {err}"));
        }
        let listen: SocketAddr = self
            .listen
            .parse()
            .map_err(|err| anyhow!("invalid listen address for webauthn origin: {err}"))?;
        let host = if listen.ip().is_loopback() {
            "localhost".to_string()
        } else {
            listen.ip().to_string()
        };
        url::Url::parse(&format!("http://{host}:{}", listen.port()))
            .map_err(|err| anyhow!("build default webauthn origin: {err}"))
    }

    pub(crate) fn webauthn_rp_id(&self) -> Result<String> {
        if let Some(rp_id) = &self.webauthn_rp_id {
            return Ok(rp_id.clone());
        }
        self.webauthn_origin()?
            .host_str()
            .map(ToString::to_string)
            .ok_or_else(|| anyhow!("webauthn origin must include a host"))
    }
}

fn parse_clock_time(value: &str) -> Option<u16> {
    let (hour, minute) = value.trim().split_once(':')?;
    if hour.len() != 2 || minute.len() != 2 {
        return None;
    }
    let hour = hour.parse::<u16>().ok()?;
    let minute = minute.parse::<u16>().ok()?;
    if hour < 24 && minute < 60 {
        Some(hour * 60 + minute)
    } else {
        None
    }
}

fn normalize_vault_relative_path(
    path: PathBuf,
    field: &str,
    markdown_file: bool,
) -> Result<PathBuf> {
    if path.as_os_str().is_empty() {
        bail!("{field} cannot be empty");
    }
    if path.is_absolute() {
        bail!("{field} must be relative to vault_path");
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(part) => normalized.push(part),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => bail!("{field} cannot contain parent components"),
            _ => bail!("{field} contains unsupported path components"),
        }
    }
    if normalized.as_os_str().is_empty() {
        bail!("{field} cannot be empty");
    }
    if markdown_file && normalized.extension().is_none() {
        normalized.set_extension("md");
    }
    if markdown_file && normalized.extension().and_then(|ext| ext.to_str()) != Some("md") {
        bail!("{field} must be a markdown file path");
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> Config {
        Config {
            listen: "127.0.0.1:8010".to_string(),
            vault_path: PathBuf::from("."),
            daily_dir: PathBuf::from("Daily"),
            entry_dir: PathBuf::from("Posts"),
            image_dir: PathBuf::from("Pics"),
            todo_path: PathBuf::from("Posts/todo.md"),
            annotation_dir: PathBuf::from("annotations"),
            log_path: PathBuf::from("logs/obr.log"),
            log_level: "info".to_string(),
            dark_mode_start: None,
            dark_mode_end: None,
            username: "admin".to_string(),
            password_hash: None,
            password: Some("secret".to_string()),
            allow_plaintext_password: false,
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
            rss_ai_full_translation_enabled: false,
            rss_ai_summary_chars: 200,
            deepseek_api_key: None,
            deepseek_api_base: "https://api.deepseek.com".to_string(),
            deepseek_model: "deepseek-v4-flash".to_string(),
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

    #[test]
    fn rss_full_translation_requires_ai_summary() {
        let mut config = test_config();
        config.allow_plaintext_password = true;
        config.rss_enabled = true;
        config.rss_ai_summary_enabled = false;
        config.rss_ai_full_translation_enabled = true;

        let err = config.validate_auth_config().unwrap_err().to_string();
        assert!(err.contains("rss_ai_full_translation_enabled"));
    }

    #[test]
    fn dark_mode_schedule_requires_valid_clock_range() {
        let mut config = test_config();
        assert!(config.validate_dark_mode_config().is_ok());

        config.dark_mode_start = Some("21:00".to_string());
        config.dark_mode_end = Some("07:30".to_string());
        assert!(config.validate_dark_mode_config().is_ok());

        config.dark_mode_end = Some("7:30".to_string());
        assert!(config.validate_dark_mode_config().is_err());

        config.dark_mode_end = None;
        assert!(config.validate_dark_mode_config().is_err());
    }

    #[test]
    fn vault_layout_paths_must_stay_inside_vault() {
        assert!(
            normalize_vault_relative_path(PathBuf::from("../Daily"), "daily_dir", false).is_err()
        );
        assert!(
            normalize_vault_relative_path(PathBuf::from("/tmp/Pics"), "image_dir", false).is_err()
        );
    }

    #[test]
    fn todo_path_defaults_to_markdown_extension() {
        let path =
            normalize_vault_relative_path(PathBuf::from("Tasks/todo"), "todo_path", true).unwrap();

        assert_eq!(path, PathBuf::from("Tasks/todo.md"));
    }

    #[test]
    fn webauthn_origin_defaults_to_https_rp_id_when_configured() {
        let mut config = test_config();
        config.webauthn_rp_id = Some("obr.example.com".to_string());

        assert_eq!(
            config.webauthn_origin().unwrap().as_str(),
            "https://obr.example.com/"
        );
    }
}
