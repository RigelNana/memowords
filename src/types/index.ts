// Domain types matching Rust backend serialization

export interface DictMeta {
  id: DictId;
  title: string;
  description: string | null;
  encoding: string;
  path: string;
  has_mdd: boolean;
  word_count: number;
}

export interface DictGroup {
  id: GroupId;
  name: string;
  dict_ids: DictId[];
}

export interface SearchCandidate {
  headword: string;
  dict_id: DictId;
  dict_name: string;
}

export interface DictArticle {
  dict_id: DictId;
  dict_name: string;
  headword: string;
  html: string;
}

// Rust newtype wrappers serialize as single-element tuples
export type DictId = { "0": string };
export type GroupId = { "0": string };

export type DarkModeStrategy = "auto" | "invert" | "custom_css" | "off";

export interface DictConfig {
  dict_id: DictId;
  display_name: string | null;
  priority: number;
  dark_mode: DarkModeStrategy;
  custom_css: string;
  custom_js: string;
  js_enabled: boolean;
}

export interface DictConfigUpdate {
  display_name?: string | null;
  priority?: number;
  dark_mode?: DarkModeStrategy;
  custom_css?: string;
  custom_js?: string;
  js_enabled?: boolean;
}

export interface DictFileInfo {
  file_size: number;
  mdd_file_size: number | null;
  imported_at: string;
  last_indexed_at: string | null;
}

// Helpers to extract raw string from newtype wrappers
export function dictIdStr(id: DictId): string {
  return id["0"];
}

export function groupIdStr(id: GroupId): string {
  return id["0"];
}
