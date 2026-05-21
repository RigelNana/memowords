#![allow(dead_code)] // Skeleton phase — remove when wiring real implementations

mod app;
mod domain;
mod infra;
mod port;

use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

fn init_tracing(log_dir: &std::path::Path) {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "memowords=debug,info".into());

    let file_appender = tracing_appender::rolling::daily(log_dir, "memowords.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Leak the guard so it lives for the process lifetime
    std::mem::forget(_guard);

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt::layer().with_target(true))
        .with(fmt::layer().with_ansi(false).with_writer(non_blocking))
        .init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("memowords")
        .join("logs");
    std::fs::create_dir_all(&log_dir).ok();
    init_tracing(&log_dir);

    tracing::info!("MemoWords starting, log_dir={}", log_dir.display());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![app::commands::greet])
        .setup(|_app| {
            tracing::info!("Tauri setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
