use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub message: String,
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        Self {
            message: format!("{err:#}"),
        }
    }
}

#[tauri::command]
pub async fn greet(name: String) -> Result<String, AppError> {
    tracing::info!(name = %name, "greet called");
    Ok(format!("Hello, {name}! MemoWords is running."))
}
