import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  theme: "light" | "dark" | "system";
  dictFontSize: number;
  uiLanguage: string;
  fuzzyThreshold: number;
  maxResults: number;
  autoLookupFirst: boolean;
  reviewAlgorithm: "sm2" | "fsrs";
  newCardsPerDay: number;
  reviewCardsPerDay: number;

  setTheme: (theme: "light" | "dark" | "system") => void;
  setDictFontSize: (size: number) => void;
  setUiLanguage: (lang: string) => void;
  setFuzzyThreshold: (threshold: number) => void;
  setMaxResults: (max: number) => void;
  setAutoLookupFirst: (v: boolean) => void;
  setReviewAlgorithm: (algo: "sm2" | "fsrs") => void;
  setNewCardsPerDay: (n: number) => void;
  setReviewCardsPerDay: (n: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      dictFontSize: 16,
      uiLanguage: "auto",
      fuzzyThreshold: 0.6,
      maxResults: 30,
      autoLookupFirst: true,
      reviewAlgorithm: "sm2",
      newCardsPerDay: 20,
      reviewCardsPerDay: 100,

      setTheme: (theme) => set({ theme }),
      setDictFontSize: (dictFontSize) => set({ dictFontSize }),
      setUiLanguage: (uiLanguage) => set({ uiLanguage }),
      setFuzzyThreshold: (fuzzyThreshold) => set({ fuzzyThreshold }),
      setMaxResults: (maxResults) => set({ maxResults }),
      setAutoLookupFirst: (autoLookupFirst) => set({ autoLookupFirst }),
      setReviewAlgorithm: (reviewAlgorithm) => set({ reviewAlgorithm }),
      setNewCardsPerDay: (newCardsPerDay) => set({ newCardsPerDay }),
      setReviewCardsPerDay: (reviewCardsPerDay) => set({ reviewCardsPerDay }),
    }),
    { name: "memowords-settings" },
  ),
);
