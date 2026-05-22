import { invoke } from "@tauri-apps/api/core";
import type {
  DetectedResources,
  DictArticle,
  DictConfig,
  DictConfigUpdate,
  DictFileInfo,
  DictGroup,
  DictMeta,
  SearchCandidate,
} from "../types";

export const api = {
  // Dictionary management
  scanDicts: (dir: string) => invoke<string[]>("scan_dicts", { dir }),

  importDict: (mdxPath: string) =>
    invoke<DictMeta>("import_dict", { mdxPath }),

  detectDictResources: (mdxPath: string) =>
    invoke<DetectedResources>("detect_dict_resources", { mdxPath }),

  listDicts: () => invoke<DictMeta[]>("list_dicts"),

  removeDict: (dictId: string) => invoke<void>("remove_dict", { dictId }),

  // Search
  search: (query: string, groupId?: string, limit?: number) =>
    invoke<SearchCandidate[]>("search", { query, groupId, limit }),

  fuzzySearch: (query: string, groupId?: string, limit?: number) =>
    invoke<SearchCandidate[]>("fuzzy_search", { query, groupId, limit }),

  lookup: (word: string, groupId?: string) =>
    invoke<DictArticle[]>("lookup", { word, groupId }),

  getResource: (dictId: string, path: string) =>
    invoke<number[] | null>("get_resource", { dictId, path }),

  // Groups
  listGroups: () => invoke<DictGroup[]>("list_groups"),

  createGroup: (name: string, dictIds: string[]) =>
    invoke<DictGroup>("create_group", { name, dictIds }),

  updateGroup: (id: string, name: string, dictIds: string[]) =>
    invoke<void>("update_group", { id, name, dictIds }),

  deleteGroup: (id: string) => invoke<void>("delete_group", { id }),

  // Dict config
  getDictConfig: (dictId: string) =>
    invoke<DictConfig>("get_dict_config", { dictId }),

  updateDictConfig: (dictId: string, config: DictConfigUpdate) =>
    invoke<void>("update_dict_config", { dictId, config }),

  getDictFileInfo: (dictId: string) =>
    invoke<DictFileInfo>("get_dict_file_info", { dictId }),

  rebuildDictIndex: (dictId: string) =>
    invoke<void>("rebuild_dict_index", { dictId }),

  rebuildAllIndexes: () => invoke<void>("rebuild_all_indexes"),
};
