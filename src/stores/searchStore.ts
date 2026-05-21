import { create } from "zustand";
import type { DictArticle, SearchCandidate } from "../types";
import { api } from "../lib/tauri";

interface SearchState {
  // Search
  query: string;
  candidates: SearchCandidate[];
  selectedIndex: number;
  isSearching: boolean;

  // Article
  currentWord: string;
  articles: DictArticle[];
  isLoadingArticles: boolean;

  // Actions
  setQuery: (q: string) => void;
  search: (q: string, groupId?: string) => Promise<void>;
  selectCandidate: (index: number) => void;
  lookup: (word: string, groupId?: string) => Promise<void>;
  clear: () => void;
  moveSelection: (direction: "up" | "down") => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  candidates: [],
  selectedIndex: 0,
  isSearching: false,

  currentWord: "",
  articles: [],
  isLoadingArticles: false,

  setQuery: (q) => set({ query: q }),

  search: async (q, groupId) => {
    if (!q.trim()) {
      set({ candidates: [], selectedIndex: 0, isSearching: false });
      return;
    }

    set({ isSearching: true });

    try {
      let results = await api.search(q, groupId, 30);

      // Fallback to fuzzy if no prefix results
      if (results.length === 0) {
        results = await api.fuzzySearch(q, groupId, 20);
      }

      set({ candidates: results, selectedIndex: 0, isSearching: false });

      // Auto-lookup first candidate
      if (results.length > 0) {
        get().lookup(results[0].headword, groupId);
      }
    } catch (e) {
      console.error("search failed:", e);
      set({ candidates: [], isSearching: false });
    }
  },

  selectCandidate: (index) => {
    const { candidates } = get();
    if (index < 0 || index >= candidates.length) return;

    set({ selectedIndex: index });
    get().lookup(candidates[index].headword);
  },

  lookup: async (word, groupId) => {
    if (!word.trim()) return;

    set({ currentWord: word, isLoadingArticles: true });

    try {
      const articles = await api.lookup(word, groupId);
      set({ articles, isLoadingArticles: false });
    } catch (e) {
      console.error("lookup failed:", e);
      set({ articles: [], isLoadingArticles: false });
    }
  },

  clear: () =>
    set({
      query: "",
      candidates: [],
      selectedIndex: 0,
      currentWord: "",
      articles: [],
      isSearching: false,
      isLoadingArticles: false,
    }),

  moveSelection: (direction) => {
    const { candidates, selectedIndex } = get();
    if (candidates.length === 0) return;

    const next =
      direction === "down"
        ? Math.min(selectedIndex + 1, candidates.length - 1)
        : Math.max(selectedIndex - 1, 0);

    if (next !== selectedIndex) {
      get().selectCandidate(next);
    }
  },
}));
