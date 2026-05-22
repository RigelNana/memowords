import { useCallback, useState } from "react";
import {
  X,
  FolderOpen,
  FileText,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../../lib/tauri";

interface ImportDictModalProps {
  onClose: () => void;
  onDone: () => void;
}

type Step = "choose" | "folder-review" | "single-config" | "importing" | "done";

type ImportStatus = "pending" | "indexing" | "done" | "error";

interface ImportItem {
  path: string;
  name: string;
  status: ImportStatus;
  error?: string;
}

interface ScannedFile {
  path: string;
  name: string;
  selected: boolean;
}

/**
 * Modal dialog for importing dictionaries.
 * Supports:
 * - Single MDX file with optional CSS/JS config
 * - Folder scan with batch import
 * - Auto-detection of associated CSS/JS files
 */
export function ImportDictModal({ onClose, onDone }: ImportDictModalProps) {
  const [step, setStep] = useState<Step>("choose");

  // Folder mode
  const [files, setFiles] = useState<ScannedFile[]>([]);
  const [scanning, setScanning] = useState(false);

  // Single mode
  const [mdxPath, setMdxPath] = useState("");
  const [cssPaths, setCssPaths] = useState<string[]>([]);
  const [jsPaths, setJsPaths] = useState<string[]>([]);
  const [customCss] = useState("");
  const [customJs] = useState("");
  const [detectedCss, setDetectedCss] = useState<string[]>([]);
  const [detectedJs, setDetectedJs] = useState<string[]>([]);
  const [detectedMdd, setDetectedMdd] = useState<string[]>([]);

  // Import progress
  const [items, setItems] = useState<ImportItem[]>([]);

  // ── Folder flow ──────────────────────────────────────────

  const handleBrowseFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;

    setScanning(true);
    try {
      const paths = await api.scanDicts(selected);
      setFiles(
        paths.map((p) => ({
          path: p,
          name: p.split("/").pop()?.replace(/\.mdx$/i, "") || p,
          selected: true,
        })),
      );
      setStep("folder-review");
    } catch (e) {
      console.error("Scan failed:", e);
    }
    setScanning(false);
  }, []);

  const toggleFile = useCallback((index: number) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, selected: !f.selected } : f)),
    );
  }, []);

  const toggleAll = useCallback(() => {
    setFiles((prev) => {
      const allSelected = prev.every((f) => f.selected);
      return prev.map((f) => ({ ...f, selected: !allSelected }));
    });
  }, []);

  // ── Single file flow ─────────────────────────────────────

  const handleBrowseMdx = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "MDX Dictionary", extensions: ["mdx"] }],
    });
    if (selected && typeof selected === "string") {
      setMdxPath(selected);
      // Auto-detect CSS/JS via backend (checks file existence)
      try {
        const resources = await api.detectDictResources(selected);
        if (resources.css_paths.length > 0) {
          setCssPaths(resources.css_paths);
          setDetectedCss(resources.css_paths);
        }
        if (resources.js_paths.length > 0) {
          setJsPaths(resources.js_paths);
          setDetectedJs(resources.js_paths);
        }
        if (resources.mdd_paths.length > 0) {
          setDetectedMdd(resources.mdd_paths);
        }
      } catch (e) {
        console.warn("Failed to detect resources:", e);
      }
      setStep("single-config");
    }
  }, []);

  // ── Import execution ─────────────────────────────────────

  const handleStartImport = useCallback(async () => {
    let toImport: { path: string; name: string }[] = [];

    if (step === "folder-review") {
      toImport = files
        .filter((f) => f.selected)
        .map((f) => ({ path: f.path, name: f.name }));
    } else if (step === "single-config") {
      const name = mdxPath.split("/").pop()?.replace(/\.mdx$/i, "") || mdxPath;
      toImport = [{ path: mdxPath, name }];
    }

    if (toImport.length === 0) return;

    setStep("importing");
    const importItems: ImportItem[] = toImport.map((f) => ({
      path: f.path,
      name: f.name,
      status: "pending",
    }));
    setItems(importItems);

    for (let i = 0; i < toImport.length; i++) {
      setItems((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, status: "indexing" } : p)),
      );
      try {
        const meta = await api.importDict(toImport[i].path);
        // Apply CSS/JS config for single-file import
        if (step === "single-config" && i === 0) {
          const hasCfg = cssPaths.length > 0 || jsPaths.length > 0 || customCss || customJs;
          if (hasCfg) {
            await api.updateDictConfig(meta.id, {
              css_paths: cssPaths.length > 0 ? cssPaths : undefined,
              js_paths: jsPaths.length > 0 ? jsPaths : undefined,
              custom_css: customCss || undefined,
              custom_js: customJs || undefined,
              js_enabled: (customJs.length > 0 || jsPaths.length > 0) ? true : undefined,
            });
          }
        }
        setItems((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, status: "done" } : p)),
        );
      } catch (e) {
        setItems((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "error", error: String(e) } : p,
          ),
        );
      }
    }
    setStep("done");
  }, [step, files, mdxPath, cssPaths, jsPaths, customCss, customJs]);

  const selectedCount = files.filter((f) => f.selected).length;

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-[var(--radius-lg)] border border-border bg-surface-base shadow-lg">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold text-text-primary">
            {step === "choose" && "Add Dictionary"}
            {step === "folder-review" && "Select Dictionaries"}
            {step === "single-config" && "Configure Import"}
            {step === "importing" && "Importing..."}
            {step === "done" && "Import Complete"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1 text-text-tertiary hover:bg-surface-sunken hover:text-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {/* Step: Choose import method */}
          {step === "choose" && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleBrowseFolder}
                disabled={scanning}
                className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-border p-6 text-center hover:border-accent/30 hover:bg-surface-sunken"
              >
                <FolderOpen size={24} className="text-accent" />
                <span className="text-sm font-medium text-text-primary">
                  {scanning ? "Scanning..." : "Scan Folder"}
                </span>
                <span className="text-xs text-text-tertiary">
                  Find all MDX files in a directory
                </span>
              </button>
              <button
                onClick={handleBrowseMdx}
                className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-border p-6 text-center hover:border-accent/30 hover:bg-surface-sunken"
              >
                <FileText size={24} className="text-accent" />
                <span className="text-sm font-medium text-text-primary">
                  Single File
                </span>
                <span className="text-xs text-text-tertiary">
                  Pick an MDX file with CSS/JS config
                </span>
              </button>
            </div>
          )}

          {/* Step: Folder review */}
          {step === "folder-review" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-secondary">
                  {files.length} dictionaries found
                </p>
                <button
                  onClick={toggleAll}
                  className="text-xs font-medium text-accent hover:text-accent/80"
                >
                  {files.every((f) => f.selected) ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-border p-2">
                {files.map((f, i) => (
                  <label
                    key={i}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 hover:bg-surface-sunken"
                  >
                    <input
                      type="checkbox"
                      checked={f.selected}
                      onChange={() => toggleFile(i)}
                      className="h-3.5 w-3.5 rounded border-border text-accent accent-accent"
                    />
                    <span className="truncate text-sm text-text-primary">{f.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step: Single file config */}
          {step === "single-config" && (
            <div className="space-y-4">
              {/* MDX path */}
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  MDX File
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mdxPath}
                    readOnly
                    className="h-8 flex-1 truncate rounded-[var(--radius-sm)] border border-border bg-surface-sunken px-2.5 text-sm text-text-primary"
                  />
                  <button
                    onClick={handleBrowseMdx}
                    className="flex h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-border px-2.5 text-xs text-text-secondary hover:bg-surface-sunken"
                  >
                    <FolderOpen size={12} /> Browse
                  </button>
                </div>
              </div>

              {/* CSS paths */}
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  CSS Files
                  {detectedCss.length > 0 && (
                    <span className="ml-1.5 font-normal text-text-tertiary">(auto-detected)</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cssPaths.join("; ")}
                    onChange={(e) => setCssPaths(e.target.value.split(";").map(s => s.trim()).filter(Boolean))}
                    placeholder="Optional — paths to .css files (semicolon-separated)"
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
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border text-text-tertiary hover:bg-surface-sunken"
                  >
                    <FolderOpen size={12} />
                  </button>
                </div>
              </div>

              {/* JS paths */}
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  JS Files
                  {detectedJs.length > 0 && (
                    <span className="ml-1.5 font-normal text-text-tertiary">(auto-detected)</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={jsPaths.join("; ")}
                    onChange={(e) => setJsPaths(e.target.value.split(";").map(s => s.trim()).filter(Boolean))}
                    placeholder="Optional — paths to .js files (semicolon-separated)"
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
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border text-text-tertiary hover:bg-surface-sunken"
                  >
                    <FolderOpen size={12} />
                  </button>
                </div>
              </div>

              {/* Detected MDD */}
              {detectedMdd.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">
                    MDD Resources
                    <span className="ml-1.5 font-normal text-text-tertiary">(auto-detected)</span>
                  </label>
                  <div className="space-y-1 rounded-[var(--radius-sm)] border border-border bg-surface-sunken px-2.5 py-2">
                    {detectedMdd.map((p, i) => (
                      <p key={i} className="truncate text-[11px] text-text-secondary">
                        {p.split("/").pop()}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Inline hint */}
              <p className="text-[11px] text-text-tertiary">
                CSS/JS/MDD files in the same folder as the MDX are auto-detected.
                You can override paths or leave empty.
              </p>
            </div>
          )}

          {/* Step: Importing / Done */}
          {(step === "importing" || step === "done") && (
            <div className="space-y-1.5">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2"
                >
                  {item.status === "pending" && (
                    <div className="h-3.5 w-3.5 rounded-full border border-border" />
                  )}
                  {item.status === "indexing" && (
                    <Loader2 size={14} className="animate-spin text-accent" />
                  )}
                  {item.status === "done" && (
                    <Check size={14} className="text-green-500" />
                  )}
                  {item.status === "error" && (
                    <AlertCircle size={14} className="text-error" />
                  )}
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm text-text-primary">{item.name}</p>
                    {item.error && (
                      <p className="truncate text-[11px] text-error">{item.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {step === "folder-review" && (
            <>
              <button
                onClick={() => setStep("choose")}
                className="h-8 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-text-secondary hover:bg-surface-sunken"
              >
                Back
              </button>
              <button
                onClick={handleStartImport}
                disabled={selectedCount === 0}
                className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-4 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                Import {selectedCount} {selectedCount === 1 ? "dictionary" : "dictionaries"}
              </button>
            </>
          )}
          {step === "single-config" && (
            <>
              <button
                onClick={() => setStep("choose")}
                className="h-8 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-text-secondary hover:bg-surface-sunken"
              >
                Back
              </button>
              <button
                onClick={handleStartImport}
                disabled={!mdxPath}
                className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-4 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                Import
              </button>
            </>
          )}
          {step === "done" && (
            <button
              onClick={onDone}
              className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-4 text-xs font-medium text-white hover:bg-accent/90"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
