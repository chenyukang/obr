use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};
use tracing::error;

#[derive(Debug)]
pub(crate) struct AppError {
    status: StatusCode,
    message: &'static str,
    source: Option<anyhow::Error>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if let Some(source) = self.source {
            error!("{:#}", source);
        }
        (self.status, self.message).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        Self::internal(err)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::internal(err)
    }
}

impl From<walkdir::Error> for AppError {
    fn from(err: walkdir::Error) -> Self {
        Self::internal(err)
    }
}

impl From<axum::http::header::InvalidHeaderValue> for AppError {
    fn from(err: axum::http::header::InvalidHeaderValue) -> Self {
        Self::internal(err)
    }
}

impl From<tower_sessions::session::Error> for AppError {
    fn from(err: tower_sessions::session::Error) -> Self {
        Self::internal(err)
    }
}

impl AppError {
    fn internal(err: impl Into<anyhow::Error>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: "internal server error",
            source: Some(err.into()),
        }
    }

    pub(crate) fn unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: "unauthorized",
            source: None,
        }
    }

    pub(crate) fn bad_request(message: &'static str) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message,
            source: None,
        }
    }
}

pub(crate) type AppResult<T> = std::result::Result<T, AppError>;
