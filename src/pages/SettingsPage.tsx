import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { SettingSection } from "../components/settings/SettingSection";
import { SettingRow } from "../components/settings/SettingRow";
import { SegmentControl } from "../components/ui/SegmentControl";
import { Select } from "../components/ui/Select";
import { Toggle } from "../components/ui/Toggle";
import { useSettingsStore } from "../stores/settingsStore";
import { useDictStore } from "../stores/dictStore";

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

export function SettingsPage() {
  const navigate = useNavigate();
  const {
    theme,
    setTheme,
    dictFontSize,
    setDictFontSize,
    fuzzyThreshold,
    setFuzzyThreshold,
    maxResults,
    setMaxResults,
    autoLookupFirst,
    setAutoLookupFirst,
    reviewAlgorithm,
    setReviewAlgorithm,
    newCardsPerDay,
    setNewCardsPerDay,
    reviewCardsPerDay,
    setReviewCardsPerDay,
  } = useSettingsStore();

  const dicts = useDictStore((s) => s.dicts);
  const groups = useDictStore((s) => s.groups);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center border-b border-border px-6">
        <h1 className="text-[1.2rem] font-semibold text-text-primary">
          Settings
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-[640px]">
          {/* Appearance */}
          <SettingSection title="Appearance">
            <SettingRow label="Theme">
              <SegmentControl
                value={theme}
                options={themeOptions}
                onChange={(v) =>
                  setTheme(v as "light" | "dark" | "system")
                }
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

          {/* Dictionaries */}
          <SettingSection title="Dictionaries">
            <SettingRow
              label="Manage dictionaries"
              suffix={`${dicts.length} loaded`}
              onClick={() => navigate("/settings/dicts")}
            />
            <SettingRow
              label="Dict groups"
              suffix={`${groups.length} groups`}
              onClick={() => navigate("/settings/dicts")}
            />
          </SettingSection>

          {/* Search */}
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
              <Toggle
                checked={autoLookupFirst}
                onChange={setAutoLookupFirst}
              />
            </SettingRow>
          </SettingSection>

          {/* Review */}
          <SettingSection title="Review">
            <SettingRow label="Algorithm">
              <SegmentControl
                value={reviewAlgorithm}
                options={algorithmOptions}
                onChange={(v) =>
                  setReviewAlgorithm(v as "sm2" | "fsrs")
                }
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
                onChange={(e) =>
                  setReviewCardsPerDay(Number(e.target.value))
                }
                className="h-8 w-20 rounded-[var(--radius-sm)] border border-border bg-surface-base px-3 text-right text-sm text-text-primary outline-none transition-colors duration-[var(--duration-fast)] focus:border-accent"
              />
            </SettingRow>
          </SettingSection>

          {/* About */}
          <SettingSection title="About">
            <SettingRow label="Version" suffix="0.1.0" />
            <SettingRow
              label="Source"
              onClick={() => window.open("https://github.com", "_blank")}
            >
              <ExternalLink size={14} className="text-text-tertiary" />
            </SettingRow>
          </SettingSection>
        </div>
      </div>
    </div>
  );
}
