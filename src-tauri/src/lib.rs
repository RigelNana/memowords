#![allow(dead_code)] // Skeleton phase — remove when wiring real implementations

mod app;
mod domain;
mod infra;
mod port;

use tauri::Manager;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use app::state::AppState;
use domain::dictionary::DictId;
use port::dict_repo::DictRepo;
use port::search_engine::SearchEngine;

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .register_uri_scheme_protocol("mdict", |ctx, request| {
            // URL format: mdict://{dict_id}/{resource_path}
            let url = request.uri();
            let path_str = url.path();
            let host = url.host().unwrap_or_default();

            // host = dict_id, path = /resource_path
            let dict_id_str = host.to_string();
            let resource_path = path_str.strip_prefix('/').unwrap_or(path_str).to_string();

            tracing::debug!(dict_id = %dict_id_str, path = %resource_path, url = %url, "mdict:// resource request");

            let state = ctx.app_handle().state::<AppState>();
            let engine = state.search_engine.clone();
            let dict_id = DictId(dict_id_str.clone());

            match engine.load_resource(&dict_id, &resource_path) {
                Ok(Some(resource)) => {
                    tracing::debug!(dict_id = %dict_id_str, path = %resource_path, mime = %resource.mime_type, size = resource.data.len(), "mdict:// resource OK");
                    tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", &resource.mime_type)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(resource.data)
                        .unwrap()
                }
                Ok(None) => {
                    tracing::warn!(dict_id = %dict_id_str, path = %resource_path, "mdict:// resource NOT FOUND");
                    tauri::http::Response::builder()
                        .status(404)
                        .body(b"Not Found".to_vec())
                        .unwrap()
                }
                Err(e) => {
                    tracing::error!(dict_id = %dict_id_str, path = %resource_path, error = %e, "mdict:// resource load FAILED");
                    tauri::http::Response::builder()
                        .status(500)
                        .body(format!("Error: {e}").into_bytes())
                        .unwrap()
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app::commands::scan_dicts,
            app::commands::detect_dict_resources,
            app::commands::import_dict,
            app::commands::list_dicts,
            app::commands::remove_dict,
            app::commands::search,
            app::commands::fuzzy_search,
            app::commands::lookup,
            app::commands::get_resource,
            app::commands::list_groups,
            app::commands::create_group,
            app::commands::update_group,
            app::commands::delete_group,
            app::commands::get_dict_config,
            app::commands::update_dict_config,
        ])
        .setup(|app| {
            let data_dir = dirs::data_local_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("memowords");
            std::fs::create_dir_all(&data_dir).ok();

            let db_path = data_dir.join("memowords.db");
            let pool = tauri::async_runtime::block_on(infra::db::create_pool(&db_path))
                .expect("failed to create database pool");

            let state = AppState::new(pool);

            // Auto-load previously imported dictionaries in background
            let engine = state.search_engine.clone();
            let repo = state.dict_repo.clone();
            std::thread::spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .unwrap();
                rt.block_on(async {
                    match repo.list_dicts().await {
                        Ok(dicts) => {
                            for meta in &dicts {
                                if let Err(e) = engine.load_dict(&meta.id, &meta.path) {
                                    tracing::warn!(
                                        id = %meta.id,
                                        path = %meta.path,
                                        error = %e,
                                        "failed to load dict on startup"
                                    );
                                }
                            }
                            tracing::info!(count = dicts.len(), "startup dict loading complete");
                        }
                        Err(e) => tracing::error!(error = %e, "failed to list dicts on startup"),
                    }
                });
            });

            app.manage(state);

            tracing::info!("Tauri setup complete, db={}", db_path.display());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
