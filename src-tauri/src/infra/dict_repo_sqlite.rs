use anyhow::Result;
use async_trait::async_trait;
use sqlx::SqlitePool;

use crate::domain::dictionary::{DictConfig, DictConfigUpdate, DictGroup, DictId, DictMeta, GroupId};
use crate::port::dict_repo::DictRepo;

pub struct SqliteDictRepo {
    pool: SqlitePool,
}

impl SqliteDictRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl DictRepo for SqliteDictRepo {
    async fn list_dicts(&self) -> Result<Vec<DictMeta>> {
        let rows = sqlx::query_as::<_, DictRow>(
            "SELECT id, title, description, encoding, path, has_mdd, word_count FROM dictionaries ORDER BY title"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    async fn get_dict(&self, id: &DictId) -> Result<Option<DictMeta>> {
        let row = sqlx::query_as::<_, DictRow>(
            "SELECT id, title, description, encoding, path, has_mdd, word_count FROM dictionaries WHERE id = ?"
        )
        .bind(id.as_str())
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    async fn save_dict(&self, meta: &DictMeta) -> Result<()> {
        sqlx::query(
            "INSERT OR REPLACE INTO dictionaries (id, title, description, encoding, path, has_mdd, word_count) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(meta.id.as_str())
        .bind(&meta.title)
        .bind(&meta.description)
        .bind(&meta.encoding)
        .bind(&meta.path)
        .bind(meta.has_mdd as i32)
        .bind(meta.word_count as i64)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn remove_dict(&self, id: &DictId) -> Result<()> {
        sqlx::query("DELETE FROM dictionaries WHERE id = ?")
            .bind(id.as_str())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn list_groups(&self) -> Result<Vec<DictGroup>> {
        let groups = sqlx::query_as::<_, GroupRow>(
            "SELECT id, name FROM dict_groups ORDER BY sort_order, name"
        )
        .fetch_all(&self.pool)
        .await?;

        let mut result = Vec::with_capacity(groups.len());
        for g in groups {
            let members = sqlx::query_scalar::<_, String>(
                "SELECT dict_id FROM dict_group_members WHERE group_id = ? ORDER BY sort_order"
            )
            .bind(&g.id)
            .fetch_all(&self.pool)
            .await?;

            result.push(DictGroup {
                id: GroupId(g.id),
                name: g.name,
                dict_ids: members.into_iter().map(DictId).collect(),
            });
        }

        Ok(result)
    }

    async fn get_group(&self, id: &GroupId) -> Result<Option<DictGroup>> {
        let group = sqlx::query_as::<_, GroupRow>(
            "SELECT id, name FROM dict_groups WHERE id = ?"
        )
        .bind(id.as_str())
        .fetch_optional(&self.pool)
        .await?;

        let Some(g) = group else {
            return Ok(None);
        };

        let members = sqlx::query_scalar::<_, String>(
            "SELECT dict_id FROM dict_group_members WHERE group_id = ? ORDER BY sort_order"
        )
        .bind(&g.id)
        .fetch_all(&self.pool)
        .await?;

        Ok(Some(DictGroup {
            id: GroupId(g.id),
            name: g.name,
            dict_ids: members.into_iter().map(DictId).collect(),
        }))
    }

    async fn save_group(&self, group: &DictGroup) -> Result<()> {
        let mut tx = self.pool.begin().await?;

        sqlx::query("INSERT OR REPLACE INTO dict_groups (id, name) VALUES (?, ?)")
            .bind(group.id.as_str())
            .bind(&group.name)
            .execute(&mut *tx)
            .await?;

        // Replace membership
        sqlx::query("DELETE FROM dict_group_members WHERE group_id = ?")
            .bind(group.id.as_str())
            .execute(&mut *tx)
            .await?;

        for (i, dict_id) in group.dict_ids.iter().enumerate() {
            sqlx::query(
                "INSERT INTO dict_group_members (group_id, dict_id, sort_order) VALUES (?, ?, ?)"
            )
            .bind(group.id.as_str())
            .bind(dict_id.as_str())
            .bind(i as i32)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn remove_group(&self, id: &GroupId) -> Result<()> {
        sqlx::query("DELETE FROM dict_groups WHERE id = ?")
            .bind(id.as_str())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_dict_config(&self, dict_id: &DictId) -> Result<DictConfig> {
        let row = sqlx::query_as::<_, DictConfigRow>(
            "SELECT dict_id, display_name, priority, dark_mode, custom_css, custom_js, js_enabled, css_paths, js_paths, extra_mdd_paths FROM dict_config WHERE dict_id = ?"
        )
        .bind(dict_id.as_str())
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(r) => Ok(r.into()),
            None => Ok(DictConfig::default_for(dict_id)),
        }
    }

    async fn update_dict_config(&self, dict_id: &DictId, update: &DictConfigUpdate) -> Result<()> {
        tracing::debug!(dict_id = %dict_id, "update_dict_config: inserting default row if needed");
        // Ensure row exists (upsert defaults first)
        let insert_result = sqlx::query(
            "INSERT OR IGNORE INTO dict_config (dict_id) VALUES (?)"
        )
        .bind(dict_id.as_str())
        .execute(&self.pool)
        .await;

        match &insert_result {
            Ok(r) => tracing::debug!(rows_affected = r.rows_affected(), "upsert result"),
            Err(e) => tracing::error!(error = %e, "upsert failed"),
        }
        insert_result?;

        // Build dynamic update
        let mut sets = Vec::new();
        let mut binds: Vec<String> = Vec::new();

        if let Some(ref dn) = update.display_name {
            sets.push("display_name = ?");
            binds.push(dn.clone());
        }
        if let Some(p) = update.priority {
            sets.push("priority = ?");
            binds.push(p.to_string());
        }
        if let Some(ref dm) = update.dark_mode {
            sets.push("dark_mode = ?");
            binds.push(dm.clone());
        }
        if let Some(ref css) = update.custom_css {
            sets.push("custom_css = ?");
            binds.push(css.clone());
        }
        if let Some(ref js) = update.custom_js {
            sets.push("custom_js = ?");
            binds.push(js.clone());
        }
        if let Some(je) = update.js_enabled {
            sets.push("js_enabled = ?");
            binds.push(if je { "1".into() } else { "0".into() });
        }
        if let Some(ref cp) = update.css_paths {
            sets.push("css_paths = ?");
            binds.push(serde_json::to_string(cp).unwrap_or_else(|_| "[]".into()));
        }
        if let Some(ref jp) = update.js_paths {
            sets.push("js_paths = ?");
            binds.push(serde_json::to_string(jp).unwrap_or_else(|_| "[]".into()));
        }
        if let Some(ref mdd) = update.extra_mdd_paths {
            sets.push("extra_mdd_paths = ?");
            binds.push(serde_json::to_string(mdd).unwrap_or_else(|_| "[]".into()));
        }

        if sets.is_empty() {
            return Ok(());
        }

        sets.push("updated_at = datetime('now')");

        let sql = format!(
            "UPDATE dict_config SET {} WHERE dict_id = ?",
            sets.join(", ")
        );

        tracing::debug!(%sql, binds = ?binds, dict_id = %dict_id, "executing update");

        let mut query = sqlx::query(&sql);
        for b in &binds {
            query = query.bind(b);
        }
        query = query.bind(dict_id.as_str());

        match query.execute(&self.pool).await {
            Ok(r) => {
                tracing::debug!(rows_affected = r.rows_affected(), "update executed");
                Ok(())
            }
            Err(e) => {
                tracing::error!(error = %e, %sql, "update_dict_config SQL failed");
                Err(e.into())
            }
        }
    }
}

#[derive(sqlx::FromRow)]
struct DictRow {
    id: String,
    title: String,
    description: Option<String>,
    encoding: String,
    path: String,
    has_mdd: i32,
    word_count: i64,
}

impl From<DictRow> for DictMeta {
    fn from(r: DictRow) -> Self {
        Self {
            id: DictId(r.id),
            title: r.title,
            description: r.description,
            encoding: r.encoding,
            path: r.path,
            has_mdd: r.has_mdd != 0,
            word_count: r.word_count as u64,
        }
    }
}

#[derive(sqlx::FromRow)]
struct GroupRow {
    id: String,
    name: String,
}

#[derive(sqlx::FromRow)]
struct DictConfigRow {
    dict_id: String,
    display_name: Option<String>,
    priority: i32,
    dark_mode: String,
    custom_css: String,
    custom_js: String,
    js_enabled: i32,
    css_paths: String,
    js_paths: String,
    extra_mdd_paths: String,
}

impl From<DictConfigRow> for DictConfig {
    fn from(r: DictConfigRow) -> Self {
        let css_paths: Vec<String> = serde_json::from_str(&r.css_paths).unwrap_or_default();
        let js_paths: Vec<String> = serde_json::from_str(&r.js_paths).unwrap_or_default();
        let mdd_paths: Vec<String> = serde_json::from_str(&r.extra_mdd_paths).unwrap_or_default();
        Self {
            dict_id: DictId(r.dict_id),
            display_name: r.display_name,
            priority: r.priority,
            dark_mode: r.dark_mode,
            custom_css: r.custom_css,
            custom_js: r.custom_js,
            js_enabled: r.js_enabled != 0,
            css_paths,
            js_paths,
            extra_mdd_paths: mdd_paths,
        }
    }
}
