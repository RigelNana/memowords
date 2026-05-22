use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::app::state::AppState;
use crate::domain::dictionary::{
    DictArticle, DictConfig, DictConfigUpdate, DictGroup, DictId, DictMeta, GroupId, SearchCandidate,
};
use crate::infra::fs::find_mdx_files;
use crate::port::dict_repo::DictRepo;
use crate::port::search_engine::SearchEngine;
use mdict::mdd::find_mdd_files;

// ─── Error type ───────────────────────────────────────────────

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

type CmdResult<T> = Result<T, AppError>;

// ─── Dictionary management ────────────────────────────────────

/// Scan a directory for MDX files, return their paths.
#[tauri::command]
pub async fn scan_dicts(dir: String) -> CmdResult<Vec<String>> {
    let path = PathBuf::from(&dir);
    let files = find_mdx_files(&path)?;
    Ok(files.iter().map(|p| p.display().to_string()).collect())
}

/// Detect CSS/JS/MDD resource files next to an MDX file.
/// Follows GoldenDict conventions:
/// - CSS: `<base>.css`, `article-style.css`
/// - JS: `<base>.js`, `article-script.js`
/// - MDD: `<base>.mdd`, `<base>.1.mdd`, `<base>.2.mdd`, ...
#[tauri::command]
pub async fn detect_dict_resources(mdx_path: String) -> CmdResult<DetectedResources> {
    let path = PathBuf::from(&mdx_path);
    let dir = path.parent().unwrap_or(&path);
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();

    let candidates_css = [
        dir.join(format!("{stem}.css")),
        dir.join("article-style.css"),
    ];
    let candidates_js = [
        dir.join(format!("{stem}.js")),
        dir.join("article-script.js"),
    ];

    let css_paths: Vec<String> = candidates_css.iter().filter(|p| p.is_file()).map(|p| p.display().to_string()).collect();
    let js_paths: Vec<String> = candidates_js.iter().filter(|p| p.is_file()).map(|p| p.display().to_string()).collect();
    let mdd_paths: Vec<String> = find_mdd_files(&path)
        .iter()
        .map(|p| p.display().to_string())
        .collect();

    Ok(DetectedResources { css_paths, js_paths, mdd_paths })
}

#[derive(Debug, Serialize)]
pub struct DetectedResources {
    pub css_paths: Vec<String>,
    pub js_paths: Vec<String>,
    pub mdd_paths: Vec<String>,
}

/// Import a dictionary: register in DB + load into search engine.
#[tauri::command]
pub async fn import_dict(
    state: State<'_, AppState>,
    mdx_path: String,
) -> CmdResult<DictMeta> {
    let search_engine = &state.search_engine;
    let dict_repo = &state.dict_repo;

    // Generate ID and load into engine
    let dict_id = DictId::new();
    let entry_count = search_engine
        .load_dict(&dict_id, &mdx_path)
        ?;

    // Build metadata from mdict info
    let meta = DictMeta {
        id: dict_id,
        title: mdx_path
            .rsplit('/')
            .next()
            .unwrap_or(&mdx_path)
            .trim_end_matches(".mdx")
            .to_string(),
        description: None,
        encoding: "UTF-8".to_string(),
        path: mdx_path,
        has_mdd: false, // Will be refined when MDD is loaded
        word_count: entry_count,
    };

    dict_repo.save_dict(&meta).await?;
    tracing::info!(id = %meta.id, title = %meta.title, "dictionary imported");

    Ok(meta)
}

/// List all registered dictionaries.
#[tauri::command]
pub async fn list_dicts(state: State<'_, AppState>) -> CmdResult<Vec<DictMeta>> {
    let dicts = state.dict_repo.list_dicts().await?;
    Ok(dicts)
}

/// Remove a dictionary from DB and search engine.
#[tauri::command]
pub async fn remove_dict(
    state: State<'_, AppState>,
    dict_id: String,
) -> CmdResult<()> {
    let id = DictId(dict_id);
    state.search_engine.unload_dict(&id);
    state.dict_repo.remove_dict(&id).await?;
    Ok(())
}

// ─── Search ───────────────────────────────────────────────────

/// Prefix search across dictionaries in a group (or all if no group).
#[tauri::command]
pub async fn search(
    state: State<'_, AppState>,
    query: String,
    group_id: Option<String>,
    limit: Option<usize>,
) -> CmdResult<Vec<SearchCandidate>> {
    let dict_ids = resolve_dict_ids(&state, group_id.as_deref()).await?;
    let limit = limit.unwrap_or(20);

    let results = state
        .search_engine
        .prefix_search(&query, &dict_ids, limit)
        ?;

    Ok(results)
}

/// Fuzzy search.
#[tauri::command]
pub async fn fuzzy_search(
    state: State<'_, AppState>,
    query: String,
    group_id: Option<String>,
    limit: Option<usize>,
) -> CmdResult<Vec<SearchCandidate>> {
    let dict_ids = resolve_dict_ids(&state, group_id.as_deref()).await?;
    let limit = limit.unwrap_or(20);

    let results = state
        .search_engine
        .fuzzy_search(&query, &dict_ids, limit)
        ?;

    Ok(results)
}

/// Lookup a word — returns full article HTML from each dict.
#[tauri::command]
pub async fn lookup(
    state: State<'_, AppState>,
    word: String,
    group_id: Option<String>,
) -> CmdResult<Vec<DictArticle>> {
    let dict_ids = resolve_dict_ids(&state, group_id.as_deref()).await?;

    let articles = state
        .search_engine
        .lookup(&word, &dict_ids)
        ?;

    Ok(articles)
}

/// Get a resource (image, audio, CSS) from a dictionary.
#[tauri::command]
pub async fn get_resource(
    state: State<'_, AppState>,
    dict_id: String,
    path: String,
) -> CmdResult<Option<Vec<u8>>> {
    let id = DictId(dict_id);
    let resource = state
        .search_engine
        .load_resource(&id, &path)
        ?;

    Ok(resource.map(|r| r.data))
}

// ─── Groups ───────────────────────────────────────────────────

#[tauri::command]
pub async fn list_groups(state: State<'_, AppState>) -> CmdResult<Vec<DictGroup>> {
    let groups = state.dict_repo.list_groups().await?;
    Ok(groups)
}

#[tauri::command]
pub async fn create_group(
    state: State<'_, AppState>,
    name: String,
    dict_ids: Vec<String>,
) -> CmdResult<DictGroup> {
    let group = DictGroup {
        id: GroupId::new(),
        name,
        dict_ids: dict_ids.into_iter().map(DictId).collect(),
    };
    state.dict_repo.save_group(&group).await?;
    Ok(group)
}

#[tauri::command]
pub async fn update_group(
    state: State<'_, AppState>,
    id: String,
    name: String,
    dict_ids: Vec<String>,
) -> CmdResult<()> {
    let group = DictGroup {
        id: GroupId(id),
        name,
        dict_ids: dict_ids.into_iter().map(DictId).collect(),
    };
    state.dict_repo.save_group(&group).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_group(
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<()> {
    state
        .dict_repo
        .remove_group(&GroupId(id))
        .await
        ?;
    Ok(())
}

// ─── Dict Config ─────────────────────────────────────────────

#[tauri::command]
pub async fn get_dict_config(
    state: State<'_, AppState>,
    dict_id: String,
) -> CmdResult<DictConfig> {
    tracing::debug!(dict_id = %dict_id, "get_dict_config called");
    let id = DictId(dict_id);
    match state.dict_repo.get_dict_config(&id).await {
        Ok(config) => {
            tracing::debug!(dict_id = %id, display_name = ?config.display_name, "get_dict_config ok");
            Ok(config)
        }
        Err(e) => {
            tracing::error!(dict_id = %id, error = %e, "get_dict_config failed");
            Err(e.into())
        }
    }
}

#[tauri::command]
pub async fn update_dict_config(
    state: State<'_, AppState>,
    dict_id: String,
    config: DictConfigUpdate,
) -> CmdResult<()> {
    tracing::debug!(dict_id = %dict_id, config = ?config, "update_dict_config called");
    let id = DictId(dict_id);
    // Sync display name to search engine if it changed
    if let Some(ref dn) = config.display_name {
        let name = if dn.is_empty() { None } else { Some(dn.clone()) };
        state.search_engine.set_display_name(&id, name);
    }
    match state.dict_repo.update_dict_config(&id, &config).await {
        Ok(()) => {
            tracing::info!(dict_id = %id, "update_dict_config ok");
            Ok(())
        }
        Err(e) => {
            tracing::error!(dict_id = %id, error = %e, "update_dict_config failed");
            Err(e.into())
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────

/// Resolve dict IDs: if group_id given, use group members; otherwise all dicts.
async fn resolve_dict_ids(
    state: &AppState,
    group_id: Option<&str>,
) -> Result<Vec<DictId>, AppError> {
    if let Some(gid) = group_id {
        let group = state
            .dict_repo
            .get_group(&GroupId(gid.to_string()))
            .await
            ?;

        match group {
            Some(g) => Ok(g.dict_ids),
            None => Ok(vec![]),
        }
    } else {
        let dicts = state.dict_repo.list_dicts().await?;
        Ok(dicts.into_iter().map(|d| d.id).collect())
    }
}
