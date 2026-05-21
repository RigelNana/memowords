use anyhow::Result;

use crate::domain::dictionary::{DictGroup, DictMeta};

pub trait DictRepo: Send + Sync {
    fn list_dicts(&self) -> Result<Vec<DictMeta>>;
    fn get_dict(&self, id: &str) -> Result<Option<DictMeta>>;
    fn save_dict(&self, meta: &DictMeta) -> Result<()>;
    fn remove_dict(&self, id: &str) -> Result<()>;

    fn list_groups(&self) -> Result<Vec<DictGroup>>;
    fn save_group(&self, group: &DictGroup) -> Result<()>;
    fn remove_group(&self, id: &str) -> Result<()>;
}
