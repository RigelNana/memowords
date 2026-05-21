use anyhow::Result;
use async_trait::async_trait;
use sqlx::SqlitePool;

use crate::domain::dictionary::{DictGroup, DictId, DictMeta, GroupId};
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
