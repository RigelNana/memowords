use std::sync::Arc;

use sqlx::SqlitePool;

use crate::infra::dict_repo_sqlite::SqliteDictRepo;
use crate::infra::search_engine_mdict::MdictSearchEngine;

/// Shared application state, managed by Tauri.
pub struct AppState {
    pub dict_repo: Arc<SqliteDictRepo>,
    pub search_engine: Arc<MdictSearchEngine>,
}

impl AppState {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            dict_repo: Arc::new(SqliteDictRepo::new(pool)),
            search_engine: Arc::new(MdictSearchEngine::new()),
        }
    }
}
