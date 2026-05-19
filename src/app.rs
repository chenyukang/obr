use std::{fs, net::SocketAddr, process::Command, sync::Arc};

use anyhow::{Context, Result};
use axum::{
    Router,
    routing::{get, post},
};
use tokio::net::TcpListener;
use tower_http::{services::ServeDir, trace::TraceLayer};
use tower_sessions::{MemoryStore, SessionManagerLayer};
use tracing::{info, warn};

use crate::{
    auth::{print_password_hash_from_stdin, session_layer},
    config::Config,
    routes,
};

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) config: Config,
}

pub async fn run() -> Result<()> {
    if std::env::args().nth(1).as_deref() == Some("hash-password") {
        print_password_hash_from_stdin()?;
        return Ok(());
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "obr=info,tower_http=info".to_string()),
        )
        .init();

    let config = Config::load()?;
    prepare_vault(&config)?;

    let listen: SocketAddr = config.listen.parse().context("invalid listen address")?;
    let session_layer = session_layer(&config);
    let state = Arc::new(AppState { config });
    let app = router(Arc::clone(&state), session_layer);

    let listener = TcpListener::bind(listen).await?;
    info!("listening on http://{listen}");
    axum::serve(listener, app).await?;
    Ok(())
}

fn prepare_vault(config: &Config) -> Result<()> {
    fs::create_dir_all(config.vault_path.join("Daily"))?;
    fs::create_dir_all(config.vault_path.join("Pics"))?;
    Ok(())
}

fn router(state: Arc<AppState>, session_layer: SessionManagerLayer<MemoryStore>) -> Router {
    Router::new()
        .route("/", get(routes::index))
        .route("/obweb", get(routes::index))
        .route("/api/login", post(routes::login))
        .route("/api/logout", post(routes::logout))
        .route("/api/verify", get(routes::verify))
        .route("/api/page", get(routes::get_page).post(routes::post_page))
        .route("/api/search", get(routes::search))
        .route("/api/entry", post(routes::post_entry))
        .route("/api/mark", post(routes::mark_todo))
        .nest_service(
            "/static/images",
            ServeDir::new(state.config.vault_path.join("Pics")),
        )
        .nest_service("/assets", ServeDir::new("static"))
        .layer(TraceLayer::new_for_http())
        .layer(session_layer)
        .with_state(state)
}

impl AppState {
    pub(crate) fn maybe_git_pull(&self) {
        if !self.config.auto_git_sync {
            return;
        }
        if let Err(err) = Command::new("git")
            .arg("pull")
            .current_dir(&self.config.vault_path)
            .status()
        {
            warn!("git pull failed to start: {err}");
        }
    }

    pub(crate) fn maybe_git_sync(&self) {
        if !self.config.auto_git_sync {
            return;
        }
        let commands: &[&[&str]] = &[&["add", "."], &["commit", "-m", "update"], &["push"]];
        for args in commands {
            match Command::new("git")
                .args(*args)
                .current_dir(&self.config.vault_path)
                .status()
            {
                Ok(status) if status.success() => {}
                Ok(status) => warn!("git {:?} exited with {status}", args),
                Err(err) => warn!("git {:?} failed to start: {err}", args),
            }
        }
    }
}
