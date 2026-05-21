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

// Helpers to extract raw string from newtype wrappers
export function dictIdStr(id: DictId): string {
  return id["0"];
}

export function groupIdStr(id: GroupId): string {
  return id["0"];
}
