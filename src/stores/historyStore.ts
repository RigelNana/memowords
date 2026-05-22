import { create } from "zustand";

export interface HistoryEntry {
  word: string;
  dictNames: string[];
  timestamp: number; // ms epoch
}

interface HistoryState {
  entries: HistoryEntry[];

  addEntry: (word: string, dictNames: string[]) => void;
  removeEntry: (index: number) => void;
  clearAll: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],

  addEntry: (word, dictNames) => {
    const { entries } = get();
    // Deduplicate: remove existing entry for same word
    const filtered = entries.filter((e) => e.word !== word);
    set({
      entries: [
        { word, dictNames, timestamp: Date.now() },
        ...filtered,
      ].slice(0, 200), // Keep max 200
    });
  },

  removeEntry: (index) => {
    set((s) => ({
      entries: s.entries.filter((_, i) => i !== index),
    }));
  },

  clearAll: () => set({ entries: [] }),
}));
