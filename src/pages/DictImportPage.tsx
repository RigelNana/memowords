import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  FolderOpen,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  X,
  Plus,
} from "lucide-react";
import { api } from "../lib/tauri";
import { useDictStore } from "../stores/dictStore";
import { CodeEditor } from "../components/settings/CodeEditor";

interface ScannedFile {
  path: string;
  name: string;
  selected: boolean;
}

type ImportStatus = "pending" | "indexing" | "done" | "error";

interface ImportProgress {
  path: string;
  name: string;
  status: ImportStatus;
  error?: string;
}

type ImportMode = "choose" | "folder" | "single";

export function DictImportPage() {
  const navigate = useNavigate();
  const loadDicts = useDictStore((s) => s.loadDicts);

  // Shared state
  const [mode, setMode] = useState<ImportMode>("choose");
  const [progress, setProgress] = useState<ImportProgress[]>([]);

  // Folder mode
  const [folderPath, setFolderPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [files, setFiles] = useState<ScannedFile[]>([]);

  // Single mode
  const [mdxPath, setMdxPath] = useState("");
  const [cssContent, setCssContent] = useState("");
  const [jsContent, setJsContent] = useState("");
  const [importing, setImporting] = useState(false);

  const allDone =
    progress.length > 0 &&
    progress.every((p) => p.status === "done" || p.status === "error");
  const showProgress = progress.length > 0;

  // ── Folder flow ──────────────────────────────────────────

  const handleBrowseFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;

    setFolderPath(selected);
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
    } catch (e) {
      console.error("Scan failed:", e);
    }
    setScanning(false);
  }, []);

  const toggleFile = useCallback((index: number) => {
    setFiles((prev) =>
      prev.map((f, i) =>
        i === index ? { ...f, selected: !f.selected } : f,
      ),
    );
  }, []);

  const toggleAll = useCallback(() => {
    setFiles((prev) => {
      const allSelected = prev.every((f) => f.selected);
      return prev.map((f) => ({ ...f, selected: !allSelected }));
    });
  }, []);

  const handleFolderImport = useCallback(async () => {
    const selected = files.filter((f) => f.selected);
    if (selected.length === 0) return;

    const items: ImportProgress[] = selected.map((f) => ({
      path: f.path,
      name: f.name,
      status: "pending",
    }));
    setProgress(items);

    for (let i = 0; i < selected.length; i++) {
      setProgress((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "indexing" } : p,
        ),
      );
      try {
        await api.importDict(selected[i].path);
        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "done" } : p,
          ),
        );
      } catch (e) {
        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "error", error: String(e) } : p,
          ),
        );
      }
    }
    await loadDicts();
  }, [files, loadDicts]);

  // ── Single file flow ─────────────────────────────────────

  const handleBrowseMdx = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "MDX Dictionary", extensions: ["mdx"] }],
    });
    if (selected && typeof selected === "string") setMdxPath(selected);
  }, []);

  const handleSingleImport = useCallback(async () => {
    if (!mdxPath) return;
    setImporting(true);
    const name = mdxPath.split("/").pop()?.replace(/\.mdx$/i, "") || mdxPath;
    setProgress([{ path: mdxPath, name, status: "indexing" }]);

    try {
      const meta = await api.importDict(mdxPath);
      // Save CSS/JS config if provided
      if (cssContent || jsContent) {
        const dictId = meta.id["0"];
        await api.updateDictConfig(dictId, {
          custom_css: cssContent || undefined,
          custom_js: jsContent || undefined,
          js_enabled: jsContent.length > 0 ? true : undefined,
        });
      }
      setProgress([{ path: mdxPath, name, status: "done" }]);
      await loadDicts();
    } catch (e) {
      setProgress([{ path: mdxPath, name, status: "error", error: String(e) }]);
    }
    setImporting(false);
  }, [mdxPath, cssContent, jsContent, loadDicts]);

  // ── Derived ──────────────────────────────────────────────

  const selectedCount = files.filter((f) => f.selected).length;

  // ── Render ───────────────────────────────────────────────

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
        <h1 className="text-[1.2rem] font-semibold text-text-primary">
          Add Dictionary
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-[640px]">

          {/* ── Progress view (shared by both modes) ──── */}
          {showProgress && (
            <div>
              <p className="mb-4 text-base font-medium text-text-primary">
                {allDone ? "Import complete" : "Importing..."}
              </p>
              <div className="space-y-2">
                {progress.map((item) => (
                  <div key={item.path} className="flex h-11 items-center gap-3 rounded-[var(--radius-sm)] border border-border px-4">
                    {item.status === "pending" && <span className="h-4 w-4 shrink-0 rounded-full border-2 border-border" />}
                    {item.status === "indexing" && <Loader2 size={16} className="shrink-0 animate-spin text-accent" />}
                    {item.status === "done" && <Check size={16} className="shrink-0 text-green-600" />}
                    {item.status === "error" && <AlertCircle size={16} className="shrink-0 text-error" />}
                    <span className="flex-1 text-sm text-text-primary">{item.name}</span>
                    {item.status === "indexing" && <span className="text-xs text-text-tertiary">Building index...</span>}
                    {item.status === "done" && <span className="text-xs text-green-600">Complete</span>}
                    {item.status === "error" && <span className="max-w-[200px] truncate text-xs text-error" title={item.error}>{item.error || "Failed"}</span>}
                  </div>
                ))}
              </div>
              {allDone && (
                <div className="mt-6 flex justify-end">
                  <button onClick={() => navigate("/settings/dicts")} className="flex h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90">
                    Done
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Mode chooser ─────────────────────────── */}
          {!showProgress && mode === "choose" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                onClick={() => setMode("folder")}
                className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-raised p-8 text-center transition-colors duration-[var(--duration-fast)] hover:border-accent/30 hover:bg-surface-sunken"
              >
                <FolderOpen size={28} strokeWidth={1.5} className="text-text-tertiary" />
                <span className="text-base font-medium text-text-primary">Scan Folder</span>
                <span className="text-sm text-text-secondary">Select a folder and batch-import all .mdx files found inside</span>
              </button>
              <button
                onClick={() => setMode("single")}
                className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-raised p-8 text-center transition-colors duration-[var(--duration-fast)] hover:border-accent/30 hover:bg-surface-sunken"
              >
                <FileText size={28} strokeWidth={1.5} className="text-text-tertiary" />
                <span className="text-base font-medium text-text-primary">Single Dictionary</span>
                <span className="text-sm text-text-secondary">Pick one .mdx file, optionally attach custom CSS / JS</span>
              </button>
            </div>
          )}

          {/* ── Folder mode ──────────────────────────── */}
          {!showProgress && mode === "folder" && (
            <div>
              <button onClick={() => { setMode("choose"); setFiles([]); setFolderPath(""); }} className="mb-4 text-xs font-medium text-accent hover:underline">
                ← Back
              </button>

              {files.length === 0 ? (
                <div className="flex flex-col items-center rounded-[var(--radius-md)] border-2 border-dashed border-border py-16">
                  <FolderOpen size={40} className="mb-3 text-text-tertiary" strokeWidth={1} />
                  <p className="text-sm text-text-secondary">Select a folder containing .mdx files</p>
                  <button
                    onClick={handleBrowseFolder}
                    disabled={scanning}
                    className="mt-4 flex h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90 disabled:opacity-50"
                  >
                    {scanning
                      ? <><Loader2 size={16} className="animate-spin" /> Scanning...</>
                      : <><FolderOpen size={16} /> Browse Folder...</>}
                  </button>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-sm text-text-secondary">
                    Found {files.length} files in{" "}
                    <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs">{folderPath}</code>
                  </p>
                  <button onClick={toggleAll} className="mb-2 text-xs font-medium text-accent hover:underline">
                    {files.every((f) => f.selected) ? "Deselect All" : "Select All"}
                  </button>
                  <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
                    {files.map((file, i) => (
                      <button key={file.path} onClick={() => toggleFile(i)} className="flex h-11 w-full items-center gap-3 px-4 text-left transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken">
                        <span className={["flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border text-[10px]", file.selected ? "border-accent bg-accent text-white" : "border-border bg-surface-base"].join(" ")}>
                          {file.selected && <Check size={10} />}
                        </span>
                        <span className="flex-1 text-base text-text-primary">{file.name}</span>
                        <span className="font-mono text-xs text-text-tertiary">.mdx</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{selectedCount} selected</span>
                    <button onClick={handleFolderImport} disabled={selectedCount === 0} className="flex h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90 disabled:opacity-50">
                      Import Selected
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Single dict mode ─────────────────────── */}
          {!showProgress && mode === "single" && (
            <div>
              <button onClick={() => { setMode("choose"); setMdxPath(""); setCssContent(""); setJsContent(""); }} className="mb-4 text-xs font-medium text-accent hover:underline">
                ← Back
              </button>

              {/* MDX file (required) */}
              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Dictionary file <span className="text-error">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex h-9 flex-1 items-center rounded-[var(--radius-sm)] border border-border bg-surface-base px-3">
                    {mdxPath ? (
                      <div className="flex flex-1 items-center gap-2">
                        <FileText size={14} className="shrink-0 text-accent" />
                        <span className="flex-1 truncate font-mono text-sm text-text-primary">{mdxPath.split("/").pop()}</span>
                        <button onClick={() => setMdxPath("")} className="shrink-0 text-text-tertiary hover:text-text-secondary"><X size={14} /></button>
                      </div>
                    ) : (
                      <span className="text-sm text-text-tertiary">No file selected</span>
                    )}
                  </div>
                  <button onClick={handleBrowseMdx} className="flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 text-sm font-medium text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken">
                    <Plus size={14} /> Browse .mdx
                  </button>
                </div>
              </div>

              {/* Custom CSS (optional) */}
              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Custom CSS <span className="ml-1 font-normal normal-case text-text-tertiary">(optional)</span>
                </label>
                <CodeEditor value={cssContent} onChange={setCssContent} language="css" placeholder="/* Styles injected into article iframe */" minHeight={80} maxHeight={200} />
              </div>

              {/* Custom JS (optional) */}
              <div className="mb-6">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Custom JS <span className="ml-1 font-normal normal-case text-text-tertiary">(optional — runs inside article iframe)</span>
                </label>
                <CodeEditor value={jsContent} onChange={setJsContent} language="javascript" placeholder="// Runs after article HTML loads in iframe" minHeight={80} maxHeight={200} />
              </div>

              {/* Import button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSingleImport}
                  disabled={!mdxPath || importing}
                  className="flex h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90 disabled:opacity-50"
                >
                  {importing
                    ? <><Loader2 size={16} className="animate-spin" /> Importing...</>
                    : "Import Dictionary"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
