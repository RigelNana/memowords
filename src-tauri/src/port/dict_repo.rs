use anyhow::Result;
use async_trait::async_trait;

use crate::domain::dictionary::{DictConfig, DictConfigUpdate, DictGroup, DictId, DictMeta, GroupId};

/// Dictionary repository port — persistence for dictionary metadata and groups.
#[async_trait]
pub trait DictRepo: Send + Sync {
    async fn list_dicts(&self) -> Result<Vec<DictMeta>>;
    async fn get_dict(&self, id: &DictId) -> Result<Option<DictMeta>>;
    async fn save_dict(&self, meta: &DictMeta) -> Result<()>;
    async fn remove_dict(&self, id: &DictId) -> Result<()>;

    async fn list_groups(&self) -> Result<Vec<DictGroup>>;
    async fn get_group(&self, id: &GroupId) -> Result<Option<DictGroup>>;
    async fn save_group(&self, group: &DictGroup) -> Result<()>;
    async fn remove_group(&self, id: &GroupId) -> Result<()>;

    async fn get_dict_config(&self, dict_id: &DictId) -> Result<DictConfig>;
    async fn update_dict_config(&self, dict_id: &DictId, update: &DictConfigUpdate) -> Result<()>;
}
