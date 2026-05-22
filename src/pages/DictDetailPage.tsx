import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";
import { api } from "../lib/tauri";
import { useDictStore } from "../stores/dictStore";
import { SettingSection } from "../components/settings/SettingSection";
import { SettingRow } from "../components/settings/SettingRow";
import { SegmentControl } from "../components/ui/SegmentControl";
import { Select } from "../components/ui/Select";
import { Toggle } from "../components/ui/Toggle";
import { CodeEditor } from "../components/settings/CodeEditor";
import { ConfirmPopover } from "../components/ui/ConfirmPopover";
import { PreviewFrame } from "../components/settings/PreviewFrame";
import type {
  DictMeta,
  DictFileInfo,
  DarkModeStrategy,
} from "../types";

const darkModeOptions = [
  { value: "auto", label: "Auto" },
  { value: "invert", label: "Invert" },
  { value: "custom_css", label: "Custom CSS" },
  { value: "off", label: "Off" },
];

const priorityOptions = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

export function DictDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dicts = useDictStore((s) => s.dicts);
  const loadDicts = useDictStore((s) => s.loadDicts);

  const [dict, setDict] = useState<DictMeta | null>(null);
  const [fileInfo, setFileInfo] = useState<DictFileInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable state
  const [displayName, setDisplayName] = useState("");
  const [priority, setPriority] = useState(5);
  const [darkMode, setDarkMode] = useState<DarkModeStrategy>("auto");
  const [customCss, setCustomCss] = useState("");
  const [customJs, setCustomJs] = useState("");
  const [jsEnabled, setJsEnabled] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);

  // Load data
  useEffect(() => {
    if (!id) return;

    const found = dicts.find((d) => d.id["0"] === id);
    if (found) setDict(found);

    Promise.all([
      api.getDictConfig(id).catch(() => null),
      api.getDictFileInfo(id).catch(() => null),
    ]).then(([cfg, info]) => {
      if (cfg) {
        setDisplayName(cfg.display_name ?? "");
        setPriority(cfg.priority);
        setDarkMode(cfg.dark_mode);
        setCustomCss(cfg.custom_css);
        setCustomJs(cfg.custom_js);
        setJsEnabled(cfg.js_enabled);
      }
      if (info) setFileInfo(info);
      setLoading(false);
    });
  }, [id, dicts]);

  // Save config
  const handleSave = useCallback(
    async (field: string, value: unknown) => {
      if (!id) return;
      setSaving(true);
      try {
        await api.updateDictConfig(id, { [field]: value });
      } catch (e) {
        console.error("Save failed:", e);
      }
      setSaving(false);
    },
    [id],
  );

  const handleSaveCss = useCallback(() => {
    handleSave("custom_css", customCss);
  }, [handleSave, customCss]);

  const handleSaveJs = useCallback(() => {
    handleSave("custom_js", customJs);
    handleSave("js_enabled", jsEnabled);
  }, [handleSave, customJs, jsEnabled]);

  const handleRebuild = useCallback(async () => {
    if (!id) return;
    setRebuilding(true);
    try {
      await api.rebuildDictIndex(id);
    } catch (e) {
      console.error("Rebuild failed:", e);
    }
    setRebuilding(false);
  }, [id]);

  const handleRemove = useCallback(async () => {
    if (!id) return;
    try {
      await api.removeDict(id);
      await loadDicts();
      navigate("/settings/dicts");
    } catch (e) {
      console.error("Remove failed:", e);
    }
  }, [id, loadDicts, navigate]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (!dict) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-text-secondary">Dictionary not found</p>
        <button
          onClick={() => navigate("/settings/dicts")}
          className="text-sm text-accent hover:underline"
        >
          Back to list
        </button>
      </div>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center gap-3 border-b border-border px-6">
        <button
          onClick={() => navigate("/settings/dicts")}
          className="rounded-[var(--radius-sm)] p-1 text-text-tertiary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken hover:text-text-primary"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 truncate text-[1.2rem] font-semibold text-text-primary">
          {displayName || dict.title}
        </h1>
        {saving && (
          <span className="text-xs text-text-tertiary">Saving...</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-[720px]">
          {/* Information */}
          <SettingSection title="Information">
            <SettingRow label="Title" suffix={dict.title} />
            <SettingRow
              label="Description"
              suffix={dict.description ?? "—"}
            />
            <SettingRow label="Encoding">
              <span className="rounded bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-secondary">
                {dict.encoding}
              </span>
            </SettingRow>
            <SettingRow
              label="Entries"
              suffix={dict.word_count.toLocaleString()}
            />
            <SettingRow label="File">
              <span
                className="max-w-[300px] truncate font-mono text-xs text-text-secondary"
                title={dict.path}
              >
                {dict.path}
              </span>
            </SettingRow>
            <SettingRow label="MDD">
              <span
                className={[
                  "rounded px-2 py-0.5 text-xs font-medium",
                  dict.has_mdd
                    ? "bg-green-500/10 text-green-600"
                    : "bg-surface-sunken text-text-tertiary",
                ].join(" ")}
              >
                {dict.has_mdd ? "Yes" : "No"}
              </span>
            </SettingRow>
            {fileInfo && (
              <>
                <SettingRow
                  label="File size"
                  suffix={formatSize(fileInfo.file_size)}
                />
                <SettingRow label="Imported" suffix={fileInfo.imported_at} />
              </>
            )}
          </SettingSection>

          {/* Display */}
          <SettingSection title="Display">
            <SettingRow label="Display name">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => handleSave("display_name", displayName || null)}
                placeholder={dict.title}
                className="h-8 w-48 rounded-[var(--radius-sm)] border border-border bg-surface-base px-3 text-right text-sm text-text-primary outline-none transition-colors duration-[var(--duration-fast)] focus:border-accent"
              />
            </SettingRow>
            <SettingRow label="Priority">
              <Select
                value={String(priority)}
                options={priorityOptions}
                onChange={(v) => {
                  const p = Number(v);
                  setPriority(p);
                  handleSave("priority", p);
                }}
                className="w-20"
              />
            </SettingRow>
            <SettingRow label="Dark mode">
              <SegmentControl
                value={darkMode}
                options={darkModeOptions}
                onChange={(v) => {
                  const dm = v as DarkModeStrategy;
                  setDarkMode(dm);
                  handleSave("dark_mode", dm);
                }}
              />
            </SettingRow>
          </SettingSection>

          {/* Custom CSS */}
          <SettingSection title="Custom CSS">
            <div className="p-4">
              <p className="mb-3 text-xs text-text-tertiary">
                Custom styles injected into the article iframe for this
                dictionary.
              </p>
              <CodeEditor
                value={customCss}
                onChange={setCustomCss}
                language="css"
                placeholder="/* e.g. .entry-body { font-size: 15px; } */"
              />
              <div className="mt-3 flex justify-between">
                <button
                  onClick={() => setCustomCss("")}
                  className="text-xs text-text-tertiary hover:text-text-secondary"
                >
                  Reset to Default
                </button>
                <button
                  onClick={handleSaveCss}
                  className="h-8 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90"
                >
                  Save CSS
                </button>
              </div>
            </div>
          </SettingSection>

          {/* Custom JS */}
          <SettingSection title="Custom JS">
            <div className="p-4">
              {/* Warning */}
              <div className="mb-3 flex items-start gap-2 rounded-[var(--radius-sm)] bg-accent/5 p-3">
                <Info size={14} className="mt-0.5 shrink-0 text-accent" />
                <p className="text-xs text-text-secondary">
                  Custom JS runs inside the article frame. Only use trusted
                  scripts. Code executes after article HTML loads.
                </p>
              </div>

              {/* Enable toggle */}
              <div className="mb-3 flex items-center gap-3">
                <Toggle checked={jsEnabled} onChange={setJsEnabled} />
                <span className="text-sm text-text-primary">
                  Enable custom JS
                </span>
              </div>

              <CodeEditor
                value={customJs}
                onChange={setCustomJs}
                language="javascript"
                placeholder="// e.g. document.querySelectorAll('.example').forEach(el => { ... })"
                disabled={!jsEnabled}
              />
              <div className="mt-3 flex justify-between">
                <button
                  onClick={() => setCustomJs("")}
                  className="text-xs text-text-tertiary hover:text-text-secondary"
                >
                  Reset to Default
                </button>
                <button
                  onClick={handleSaveJs}
                  className="h-8 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90"
                >
                  Save JS
                </button>
              </div>
            </div>
          </SettingSection>

          {/* Preview */}
          <SettingSection title="Preview">
            <div className="p-4">
              <PreviewFrame
                dictId={id!}
                customCss={customCss}
                customJs={jsEnabled ? customJs : undefined}
              />
            </div>
          </SettingSection>

          {/* Danger Zone */}
          <SettingSection title="Danger Zone">
            <SettingRow label="Rebuild index" description="Re-scan and rebuild the search index for this dictionary">
              <ConfirmPopover
                open={rebuildConfirmOpen}
                onClose={() => setRebuildConfirmOpen(false)}
                onConfirm={handleRebuild}
                title="Rebuild index?"
                description="This may take a few seconds for large dictionaries."
                confirmLabel="Rebuild"
              >
                <button
                  onClick={() => setRebuildConfirmOpen(true)}
                  disabled={rebuilding}
                  className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 text-sm font-medium text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken disabled:opacity-50"
                >
                  {rebuilding ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <AlertTriangle size={14} />
                  )}
                  Rebuild
                </button>
              </ConfirmPopover>
            </SettingRow>
            <SettingRow label="Remove dictionary" description="Remove from app (original files will not be deleted)">
              <ConfirmPopover
                open={removeConfirmOpen}
                onClose={() => setRemoveConfirmOpen(false)}
                onConfirm={handleRemove}
                title="Remove dictionary?"
                description="This dictionary will be unloaded and removed from all groups."
                confirmLabel="Remove"
                variant="danger"
              >
                <button
                  onClick={() => setRemoveConfirmOpen(true)}
                  className="h-8 rounded-[var(--radius-sm)] bg-error/10 px-3 text-sm font-medium text-error transition-colors duration-[var(--duration-fast)] hover:bg-error/20"
                >
                  Remove Dictionary
                </button>
              </ConfirmPopover>
            </SettingRow>
          </SettingSection>
        </div>
      </div>
    </div>
  );
}
