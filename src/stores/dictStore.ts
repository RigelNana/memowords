import { create } from "zustand";
import type { DictGroup, DictMeta } from "../types";
import { api } from "../lib/tauri";

interface DictState {
  dicts: DictMeta[];
  groups: DictGroup[];
  activeGroupId: string | null; // null = all dicts

  loadDicts: () => Promise<void>;
  loadGroups: () => Promise<void>;
  setActiveGroup: (id: string | null) => void;
  activeGroupIdValue: () => string | undefined;
}

export const useDictStore = create<DictState>((set, get) => ({
  dicts: [],
  groups: [],
  activeGroupId: null,

  loadDicts: async () => {
    try {
      const dicts = await api.listDicts();
      set({ dicts });
    } catch (e) {
      console.error("failed to load dicts:", e);
    }
  },

  loadGroups: async () => {
    try {
      const groups = await api.listGroups();
      set({ groups });
    } catch (e) {
      console.error("failed to load groups:", e);
    }
  },

  setActiveGroup: (id) => set({ activeGroupId: id }),

  activeGroupIdValue: () => {
    const { activeGroupId } = get();
    return activeGroupId ?? undefined;
  },
}));
