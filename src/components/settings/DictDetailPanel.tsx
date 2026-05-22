import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../../lib/tauri";
import { CodeEditor } from "./CodeEditor";
import type { DictMeta } from "../../types";

/**
 * Right-side detail/edit panel for a selected dictionary.
 * Shows metadata + config editing (CSS, JS, MDD paths, display name).
 */
export function DictDetailPanel({
  dictId,
  dictMeta,
}: {
  dictId: string;
  dictMeta: DictMeta;
}) {
  const [displayName, setDisplayName] = useState(dictMeta.title);
  const [customCss, setCustomCss] = useState("");
  const [customJs, setCustomJs] = useState("");
  const [cssPaths, setCssPaths] = useState<string[]>([]);
  const [jsPaths, setJsPaths] = useState<string[]>([]);
  const [mddPaths, setMddPaths] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load existing config
  useEffect(() => {
    api.getDictConfig(dictId).then((cfg) => {
      if (cfg.display_name) setDisplayName(cfg.display_name);
      if (cfg.custom_css) setCustomCss(cfg.custom_css);
      if (cfg.custom_js) setCustomJs(cfg.custom_js);
      if (cfg.css_paths?.length) setCssPaths(cfg.css_paths);
      if (cfg.js_paths?.length) setJsPaths(cfg.js_paths);
      if (cfg.extra_mdd_paths?.length) setMddPaths(cfg.extra_mdd_paths);
    }).catch((e) => {
      console.error("[DictDetailPanel] getDictConfig failed:", e);
    });
  }, [dictId]);

  // Reset fields on dict change
  useEffect(() => {
    setDisplayName(dictMeta.title);
    setCustomCss("");
    setCustomJs("");
    setCssPaths([]);
    setJsPaths([]);
    setMddPaths([]);
    setSaved(false);
  }, [dictId, dictMeta.title]);

  const handleSave = useCallback(async () => {
    const payload = {
      display_name: displayName,
      custom_css: customCss,
      custom_js: customJs,
      js_enabled: customJs.length > 0,
      css_paths: cssPaths.length > 0 ? cssPaths : undefined,
      js_paths: jsPaths.length > 0 ? jsPaths : undefined,
      extra_mdd_paths: mddPaths,
    };
    setSaving(true);
    try {
      await api.updateDictConfig(dictId, payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error("[DictDetailPanel] save failed:", e);
    }
    setSaving(false);
  }, [dictId, displayName, customCss, customJs, cssPaths, jsPaths, mddPaths]);

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{dictMeta.title}</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {dictMeta.word_count.toLocaleString()} entries
            <span className="mx-1">·</span>
            {dictMeta.has_mdd ? "MDX + MDD" : "MDX only"}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : saved ? (
            <Check size={13} />
          ) : null}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      {/* Display name */}
      <Field label="Display Name">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="h-8 w-full rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5 text-sm text-text-primary outline-none focus:border-accent"
        />
      </Field>

      {/* CSS paths */}
      <Field label="CSS File Paths">
        <div className="flex gap-2">
          <input
            type="text"
            value={cssPaths.join("; ")}
            onChange={(e) => setCssPaths(e.target.value.split(";").map(s => s.trim()).filter(Boolean))}
            placeholder="Semicolon-separated paths to .css files"
            className="h-8 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
          />
          <button
            onClick={async () => {
              const selected = await open({ directory: false, multiple: true, filters: [{ name: "CSS", extensions: ["css"] }] });
              if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                setCssPaths(prev => [...new Set([...prev, ...paths])]);
              }
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border text-text-tertiary hover:bg-surface-sunken hover:text-text-secondary"
          >
            <FolderOpen size={14} />
          </button>
        </div>
      </Field>

      {/* JS paths */}
      <Field label="JS File Paths">
        <div className="flex gap-2">
          <input
            type="text"
            value={jsPaths.join("; ")}
            onChange={(e) => setJsPaths(e.target.value.split(";").map(s => s.trim()).filter(Boolean))}
            placeholder="Semicolon-separated paths to .js files"
            className="h-8 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
          />
          <button
            onClick={async () => {
              const selected = await open({ directory: false, multiple: true, filters: [{ name: "JavaScript", extensions: ["js"] }] });
              if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                setJsPaths(prev => [...new Set([...prev, ...paths])]);
              }
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border text-text-tertiary hover:bg-surface-sunken hover:text-text-secondary"
          >
            <FolderOpen size={14} />
          </button>
        </div>
      </Field>

      {/* Custom CSS editor */}
      <Field label="Custom CSS">
        <CodeEditor
          value={customCss}
          onChange={setCustomCss}
          language="css"
          placeholder="/* Custom styles for this dictionary */"
        />
      </Field>

      {/* Custom JS editor */}
      <Field label="Custom JS">
        <CodeEditor
          value={customJs}
          onChange={setCustomJs}
          language="javascript"
          placeholder="// Custom script for this dictionary"
        />
      </Field>

      {/* Extra MDD paths */}
      <Field label="Extra MDD Paths">
        <div className="space-y-1.5">
          {mddPaths.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={p}
                onChange={(e) => {
                  const copy = [...mddPaths];
                  copy[i] = e.target.value;
                  setMddPaths(copy);
                }}
                className="h-8 flex-1 rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5 text-sm text-text-primary outline-none focus:border-accent"
              />
              <button
                onClick={() => setMddPaths(mddPaths.filter((_, idx) => idx !== i))}
                className="h-8 px-2 text-xs text-text-tertiary hover:text-error"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            onClick={async () => {
              const selected = await open({
                directory: false,
                multiple: false,
                filters: [{ name: "MDD", extensions: ["mdd"] }],
              });
              if (selected && typeof selected === "string") {
                setMddPaths([...mddPaths, selected]);
              }
            }}
            className="text-xs font-medium text-accent hover:text-accent/80"
          >
            + Add MDD file
          </button>
        </div>
      </Field>

      {/* Dict file info */}
      <div className="mt-2 rounded-[var(--radius-md)] border border-border/50 bg-surface-sunken px-3.5 py-2.5">
        <p className="text-[11px] text-text-tertiary">
          <span className="font-medium">Path:</span> {dictMeta.path}
        </p>
      </div>
    </div>
  );
}

// ── Field ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-text-secondary">
        {label}
      </label>
      {children}
    </div>
  );
}
