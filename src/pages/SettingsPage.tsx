import { useState, useCallback } from "react";
import {
  Settings2,
  Search,
  BookOpen,
  Library,
  Info,
} from "lucide-react";
import { SettingSection } from "../components/settings/SettingSection";
import { SettingRow } from "../components/settings/SettingRow";
import { SegmentControl } from "../components/ui/SegmentControl";
import { Select } from "../components/ui/Select";
import { Toggle } from "../components/ui/Toggle";
import { useSettingsStore } from "../stores/settingsStore";
import { DictsPanel } from "../components/settings/DictsPanel";

// ── Option data ────────────────────────────────────────────

const themeOptions = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const fontSizeOptions = [
  { value: "14", label: "14px" },
  { value: "16", label: "16px" },
  { value: "18", label: "18px" },
  { value: "20", label: "20px" },
];

const fuzzyOptions = [
  { value: "0.4", label: "0.4 (loose)" },
  { value: "0.6", label: "0.6 (default)" },
  { value: "0.8", label: "0.8 (strict)" },
];

const algorithmOptions = [
  { value: "sm2", label: "SM-2" },
  { value: "fsrs", label: "FSRS" },
];

// ── Tab definitions ────────────────────────────────────────

type TabId = "general" | "search" | "review" | "dicts" | "about";

const tabs: { id: TabId; label: string; icon: typeof Settings2 }[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "search", label: "Search", icon: Search },
  { id: "review", label: "Review", icon: BookOpen },
  { id: "dicts", label: "Dictionaries", icon: Library },
  { id: "about", label: "About", icon: Info },
];

// ── Component ──────────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  const {
    theme, setTheme,
    dictFontSize, setDictFontSize,
    fuzzyThreshold, setFuzzyThreshold,
    maxResults, setMaxResults,
    autoLookupFirst, setAutoLookupFirst,
    reviewAlgorithm, setReviewAlgorithm,
    newCardsPerDay, setNewCardsPerDay,
    reviewCardsPerDay, setReviewCardsPerDay,
  } = useSettingsStore();

  // Keyboard nav: arrow keys move tabs
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = tabs.findIndex((t) => t.id === activeTab);
      if (e.key === "ArrowDown" && idx < tabs.length - 1) {
        e.preventDefault();
        setActiveTab(tabs[idx + 1].id);
      } else if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        setActiveTab(tabs[idx - 1].id);
      }
    },
    [activeTab],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center border-b border-border px-6">
        <h1 className="text-[1.2rem] font-semibold text-text-primary">
          Settings
        </h1>
      </div>

      {/* Body: sidebar tabs + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tab sidebar */}
        <nav
          className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border px-2 py-3"
          role="tablist"
          aria-orientation="vertical"
          onKeyDown={handleTabKeyDown}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex h-8 items-center gap-2.5 rounded-[var(--radius-sm)] px-3 text-[13px] font-medium transition-colors duration-[var(--duration-fast)]",
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
                ].join(" ")}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content panel */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mx-auto max-w-[560px]">
            {/* ── General ─────────────────────────── */}
            {activeTab === "general" && (
              <>
                <SettingSection title="Appearance">
                  <SettingRow label="Theme">
                    <SegmentControl
                      value={theme}
                      options={themeOptions}
                      onChange={(v) => setTheme(v as "light" | "dark" | "system")}
                    />
                  </SettingRow>
                  <SettingRow label="Dictionary font size">
                    <Select
                      value={String(dictFontSize)}
                      options={fontSizeOptions}
                      onChange={(v) => setDictFontSize(Number(v))}
                      className="w-24"
                    />
                  </SettingRow>
                </SettingSection>
              </>
            )}

            {/* ── Search ──────────────────────────── */}
            {activeTab === "search" && (
              <SettingSection title="Search">
                <SettingRow label="Fuzzy threshold">
                  <Select
                    value={String(fuzzyThreshold)}
                    options={fuzzyOptions}
                    onChange={(v) => setFuzzyThreshold(Number(v))}
                    className="w-36"
                  />
                </SettingRow>
                <SettingRow label="Max results">
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={maxResults}
                    onChange={(e) => setMaxResults(Number(e.target.value))}
                    className="h-8 w-20 rounded-[var(--radius-sm)] border border-border bg-surface-base px-3 text-right text-sm text-text-primary outline-none transition-colors duration-[var(--duration-fast)] focus:border-accent"
                  />
                </SettingRow>
                <SettingRow label="Auto-lookup first match">
                  <Toggle checked={autoLookupFirst} onChange={setAutoLookupFirst} />
                </SettingRow>
              </SettingSection>
            )}

            {/* ── Review ──────────────────────────── */}
            {activeTab === "review" && (
              <SettingSection title="Review">
                <SettingRow label="Algorithm">
                  <SegmentControl
                    value={reviewAlgorithm}
                    options={algorithmOptions}
                    onChange={(v) => setReviewAlgorithm(v as "sm2" | "fsrs")}
                  />
                </SettingRow>
                <SettingRow label="New cards per day">
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={newCardsPerDay}
                    onChange={(e) => setNewCardsPerDay(Number(e.target.value))}
                    className="h-8 w-20 rounded-[var(--radius-sm)] border border-border bg-surface-base px-3 text-right text-sm text-text-primary outline-none transition-colors duration-[var(--duration-fast)] focus:border-accent"
                  />
                </SettingRow>
                <SettingRow label="Review cards per day">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={reviewCardsPerDay}
                    onChange={(e) => setReviewCardsPerDay(Number(e.target.value))}
                    className="h-8 w-20 rounded-[var(--radius-sm)] border border-border bg-surface-base px-3 text-right text-sm text-text-primary outline-none transition-colors duration-[var(--duration-fast)] focus:border-accent"
                  />
                </SettingRow>
              </SettingSection>
            )}

            {/* ── Dictionaries ────────────────────── */}
            {activeTab === "dicts" && <DictsPanel />}

            {/* ── About ───────────────────────────── */}
            {activeTab === "about" && (
              <SettingSection title="About">
                <SettingRow label="Version" suffix="0.1.0" />
                <SettingRow label="MemoWords">
                  <span className="text-xs text-text-tertiary">
                    High-performance dictionary & vocabulary app
                  </span>
                </SettingRow>
              </SettingSection>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
