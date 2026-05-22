import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Plus,
  FolderOpen,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  Trash2,
  BookOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/tauri";
import { useDictStore } from "../../stores/dictStore";
import { ConfirmPopover } from "../ui/ConfirmPopover";
import { CodeEditor } from "./CodeEditor";
import type { DictGroup, DictMeta } from "../../types";

// ── Types ──────────────────────────────────────────────────

type ImportMode = "idle" | "choose" | "folder-browse" | "folder-review" | "single" | "importing";

type ImportStatus = "pending" | "indexing" | "done" | "error";

interface ImportProgress {
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

// ── DictsPanel ─────────────────────────────────────────────

export function DictsPanel() {
  const dicts = useDictStore((s) => s.dicts);
  const loadDicts = useDictStore((s) => s.loadDicts);

  // Import state
  const [importMode, setImportMode] = useState<ImportMode>("idle");
  const [progress, setProgress] = useState<ImportProgress[]>([]);

  // Folder mode
  const [folderPath, setFolderPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [files, setFiles] = useState<ScannedFile[]>([]);

  // Single mode
  const [mdxPath, setMdxPath] = useState("");
  const [cssContent, setCssContent] = useState("");
  const [jsContent, setJsContent] = useState("");

  // Expanded dict detail
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadDicts();
  }, [loadDicts]);

  const allDone = progress.length > 0 && progress.every((p) => p.status === "done" || p.status === "error");

  // ── Reset ──────────────────────────────────────────────

  const resetImport = useCallback(() => {
    setImportMode("idle");
    setProgress([]);
    setFiles([]);
    setFolderPath("");
    setMdxPath("");
    setCssContent("");
    setJsContent("");
  }, []);

  // ── Folder flow ────────────────────────────────────────

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
      setImportMode("folder-review");
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

  const handleFolderImport = useCallback(async () => {
    const selected = files.filter((f) => f.selected);
    if (selected.length === 0) return;

    setImportMode("importing");
    const items: ImportProgress[] = selected.map((f) => ({
      path: f.path,
      name: f.name,
      status: "pending",
    }));
    setProgress(items);

    for (let i = 0; i < selected.length; i++) {
      setProgress((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, status: "indexing" } : p)),
      );
      try {
        await api.importDict(selected[i].path);
        setProgress((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, status: "done" } : p)),
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

  // ── Single file flow ───────────────────────────────────

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

    setImportMode("importing");
    const name = mdxPath.split("/").pop()?.replace(/\.mdx$/i, "") || mdxPath;
    setProgress([{ path: mdxPath, name, status: "indexing" }]);

    try {
      const meta = await api.importDict(mdxPath);
      if (cssContent || jsContent) {
        const dictId = meta.id;
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
  }, [mdxPath, cssContent, jsContent, loadDicts]);

  // ── Remove dict ────────────────────────────────────────

  const handleRemove = useCallback(
    async (id: string) => {
      try {
        await api.removeDict(id);
        if (expandedId === id) setExpandedId(null);
        loadDicts();
      } catch (e) {
        console.error("Failed to remove dict:", e);
      }
    },
    [expandedId, loadDicts],
  );

  // ── Derived ────────────────────────────────────────────

  const selectedCount = files.filter((f) => f.selected).length;
  const isImporting = importMode === "importing";

  // ── Render ─────────────────────────────────────────────

  return (
    <div>
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Dictionaries
          {dicts.length > 0 && (
            <span className="ml-2 font-normal normal-case text-text-tertiary">
              {dicts.length} loaded
            </span>
          )}
        </h2>
        {importMode === "idle" && (
          <button
            onClick={() => setImportMode("choose")}
            className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-2.5 text-xs font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90"
          >
            <Plus size={14} />
            Add
          </button>
        )}
        {importMode !== "idle" && !isImporting && (
          <button
            onClick={resetImport}
            className="text-xs font-medium text-text-tertiary hover:text-text-secondary"
          >
            Cancel
          </button>
        )}
      </div>

      {/* ── Import: Mode chooser ──────────────────── */}
      {importMode === "choose" && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              setImportMode("folder-browse");
              handleBrowseFolder();
            }}
            className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-border p-5 text-center transition-colors duration-[var(--duration-fast)] hover:border-accent/30 hover:bg-surface-sunken"
          >
            <FolderOpen size={22} strokeWidth={1.5} className="text-text-tertiary" />
            <span className="text-sm font-medium text-text-primary">Scan Folder</span>
            <span className="text-xs text-text-tertiary">Batch import .mdx files</span>
          </button>
          <button
            onClick={() => setImportMode("single")}
            className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-border p-5 text-center transition-colors duration-[var(--duration-fast)] hover:border-accent/30 hover:bg-surface-sunken"
          >
            <FileText size={22} strokeWidth={1.5} className="text-text-tertiary" />
            <span className="text-sm font-medium text-text-primary">Single File</span>
            <span className="text-xs text-text-tertiary">With optional CSS / JS</span>
          </button>
        </div>
      )}

      {/* ── Import: Folder browse (scanning) ──────── */}
      {importMode === "folder-browse" && (
        <div className="mb-4 flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-border py-8">
          {scanning ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 size={16} className="animate-spin text-accent" />
              Scanning {folderPath.split("/").pop()}...
            </div>
          ) : (
            <button
              onClick={handleBrowseFolder}
              className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
            >
              <FolderOpen size={16} />
              Browse Folder...
            </button>
          )}
        </div>
      )}

      {/* ── Import: Folder review ─────────────────── */}
      {importMode === "folder-review" && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              Found {files.length} files in{" "}
              <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[11px]">
                {folderPath.split("/").pop()}
              </code>
            </span>
            <button onClick={toggleAll} className="text-xs font-medium text-accent hover:underline">
              {files.every((f) => f.selected) ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="max-h-48 divide-y divide-border overflow-y-auto rounded-[var(--radius-md)] border border-border">
            {files.map((file, i) => (
              <button
                key={file.path}
                onClick={() => toggleFile(i)}
                className="flex h-9 w-full items-center gap-2.5 px-3 text-left transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken"
              >
                <span
                  className={[
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px]",
                    file.selected ? "border-accent bg-accent text-white" : "border-border bg-surface-base",
                  ].join(" ")}
                >
                  {file.selected && <Check size={9} />}
                </span>
                <span className="flex-1 truncate text-sm text-text-primary">{file.name}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-text-tertiary">{selectedCount} selected</span>
            <button
              onClick={handleFolderImport}
              disabled={selectedCount === 0}
              className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90 disabled:opacity-50"
            >
              Import
            </button>
          </div>
        </div>
      )}

      {/* ── Import: Single file ───────────────────── */}
      {importMode === "single" && (
        <div className="mb-4 space-y-3">
          {/* File picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Dictionary file <span className="text-error">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex h-8 flex-1 items-center rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5">
                {mdxPath ? (
                  <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
                    <FileText size={13} className="shrink-0 text-accent" />
                    <span className="flex-1 truncate font-mono text-xs text-text-primary">
                      {mdxPath.split("/").pop()}
                    </span>
                    <button onClick={() => setMdxPath("")} className="shrink-0 text-text-tertiary hover:text-text-secondary">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-text-tertiary">No file selected</span>
                )}
              </div>
              <button
                onClick={handleBrowseMdx}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border px-2.5 text-xs font-medium text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken"
              >
                Browse
              </button>
            </div>
          </div>

          {/* CSS */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Custom CSS <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <CodeEditor value={cssContent} onChange={setCssContent} language="css" placeholder="/* article styles */" minHeight={60} maxHeight={140} />
          </div>

          {/* JS */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Custom JS <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <CodeEditor value={jsContent} onChange={setJsContent} language="javascript" placeholder="// runs inside iframe" minHeight={60} maxHeight={140} />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSingleImport}
              disabled={!mdxPath}
              className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90 disabled:opacity-50"
            >
              Import
            </button>
          </div>
        </div>
      )}

      {/* ── Import: Progress ──────────────────────── */}
      {isImporting && (
        <div className="mb-4">
          <div className="space-y-1.5">
            {progress.map((item) => (
              <div key={item.path} className="flex h-9 items-center gap-2.5 rounded-[var(--radius-sm)] border border-border px-3">
                {item.status === "pending" && <span className="h-3 w-3 shrink-0 rounded-full border-2 border-border" />}
                {item.status === "indexing" && <Loader2 size={14} className="shrink-0 animate-spin text-accent" />}
                {item.status === "done" && <Check size={14} className="shrink-0 text-green-600" />}
                {item.status === "error" && <AlertCircle size={14} className="shrink-0 text-error" />}
                <span className="flex-1 truncate text-sm text-text-primary">{item.name}</span>
                {item.status === "indexing" && <span className="text-[11px] text-text-tertiary">indexing...</span>}
                {item.status === "error" && (
                  <span className="max-w-[140px] truncate text-[11px] text-error" title={item.error}>
                    {item.error}
                  </span>
                )}
              </div>
            ))}
          </div>
          {allDone && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={resetImport}
                className="flex h-7 items-center rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Dict list ─────────────────────────────── */}
      {dicts.length === 0 && importMode === "idle" ? (
        <div className="flex flex-col items-center py-12">
          <BookOpen size={36} className="mb-3 text-text-tertiary" strokeWidth={1} />
          <p className="text-sm text-text-secondary">No dictionaries yet</p>
          <p className="mt-0.5 text-xs text-text-tertiary">Click "Add" to import dictionaries</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence mode="popLayout">
            {dicts.map((dict) => (
              <DictRow
                key={dict.id}
                dict={dict}
                expanded={expandedId === dict.id}
                onToggle={() => setExpandedId(expandedId === dict.id ? null : dict.id)}
                onRemove={handleRemove}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Groups ────────────────────────────────── */}
      <div className="mt-8 border-t border-border pt-6">
        <GroupsPanel />
      </div>
    </div>
  );
}

// ── GroupsPanel ────────────────────────────────────────────

function GroupsPanel() {
  const dicts = useDictStore((s) => s.dicts);
  const groups = useDictStore((s) => s.groups);
  const loadGroups = useDictStore((s) => s.loadGroups);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDictIds, setEditDictIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const startCreate = useCallback(() => {
    setCreating(true);
    setEditingId(null);
    setEditName("");
    setEditDictIds(new Set());
  }, []);

  const startEdit = useCallback((group: DictGroup) => {
    setCreating(false);
    setEditingId(group.id);
    setEditName(group.name);
    setEditDictIds(new Set(group.dict_ids));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setCreating(false);
  }, []);

  const toggleDict = useCallback((dictId: string) => {
    setEditDictIds((prev) => {
      const next = new Set(prev);
      if (next.has(dictId)) next.delete(dictId);
      else next.add(dictId);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const ids = [...editDictIds];
      if (creating) {
        await api.createGroup(editName.trim(), ids);
      } else if (editingId) {
        await api.updateGroup(editingId, editName.trim(), ids);
      }
      await loadGroups();
      cancelEdit();
    } catch (e) {
      console.error("Save group failed:", e);
    }
    setSaving(false);
  }, [editName, editDictIds, creating, editingId, loadGroups, cancelEdit]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await api.deleteGroup(id);
        if (editingId === id) cancelEdit();
        loadGroups();
      } catch (e) {
        console.error("Delete group failed:", e);
      }
    },
    [editingId, cancelEdit, loadGroups],
  );

  const isEditing = creating || editingId !== null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Groups
          {groups.length > 0 && (
            <span className="ml-2 font-normal normal-case text-text-tertiary">
              {groups.length}
            </span>
          )}
        </h2>
        {!isEditing && (
          <button
            onClick={startCreate}
            className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-2.5 text-xs font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90"
          >
            <Plus size={14} />
            New Group
          </button>
        )}
      </div>

      {/* Edit / create form */}
      {isEditing && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-border p-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Group name</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. English, Japanese"
              className="h-8 w-full rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5 text-sm text-text-primary outline-none transition-colors duration-[var(--duration-fast)] focus:border-accent"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Dictionaries <span className="font-normal text-text-tertiary">({editDictIds.size} selected)</span>
            </label>
            {dicts.length > 0 ? (
              <div className="max-h-40 divide-y divide-border overflow-y-auto rounded-[var(--radius-md)] border border-border">
                {dicts.map((dict) => {
                  const did = dict.id;
                  const checked = editDictIds.has(did);
                  return (
                    <button
                      key={did}
                      onClick={() => toggleDict(did)}
                      className="flex h-9 w-full items-center gap-2.5 px-3 text-left transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken"
                    >
                      <span
                        className={[
                          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px]",
                          checked ? "border-accent bg-accent text-white" : "border-border bg-surface-base",
                        ].join(" ")}
                      >
                        {checked && <Check size={9} />}
                      </span>
                      <span className="flex-1 truncate text-sm text-text-primary">{dict.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-text-tertiary">No dictionaries imported yet</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={cancelEdit}
              className="h-7 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-text-secondary hover:bg-surface-sunken"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : creating ? "Create" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Group list */}
      {groups.length === 0 && !isEditing ? (
        <p className="py-6 text-center text-xs text-text-tertiary">
          No groups yet. Create a group to organize dictionaries for lookup.
        </p>
      ) : (
        <div className="space-y-1.5">
          {groups.map((group) => {
            const gid = group.id;
            const isActive = editingId === gid;
            return (
              <div
                key={gid}
                className={[
                  "flex items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-2.5 transition-colors duration-[var(--duration-fast)]",
                  isActive ? "border-accent/30 bg-accent/5" : "border-border hover:bg-surface-sunken",
                ].join(" ")}
              >
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium text-text-primary">{group.name}</p>
                  <p className="text-[11px] text-text-tertiary">
                    {group.dict_ids.length} {group.dict_ids.length === 1 ? "dictionary" : "dictionaries"}
                  </p>
                </div>
                <button
                  onClick={() => startEdit(group)}
                  className="text-xs font-medium text-text-tertiary hover:text-accent"
                >
                  Edit
                </button>
                <ConfirmPopover
                  open={false}
                  onClose={() => {}}
                  onConfirm={() => handleDelete(gid)}
                  title="Delete group?"
                  description="Dictionaries will not be removed."
                  confirmLabel="Delete"
                  variant="danger"
                >
                  <button
                    onClick={() => handleDelete(gid)}
                    className="text-text-tertiary hover:text-error"
                    aria-label="Delete group"
                  >
                    <Trash2 size={14} />
                  </button>
                </ConfirmPopover>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── DictRow ────────────────────────────────────────────────

function DictRow({
  dict,
  expanded,
  onToggle,
  onRemove,
}: {
  dict: DictMeta;
  expanded: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dictId = dict.id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-[var(--radius-md)] border border-border"
    >
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken"
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-text-tertiary" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-text-tertiary" />
        )}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-subtle text-xs font-semibold text-accent">
          {dict.title.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="truncate text-sm font-medium text-text-primary">{dict.title}</p>
          <p className="text-[11px] text-text-tertiary">
            {dict.word_count.toLocaleString()} entries
            <span className="mx-1">·</span>
            {dict.has_mdd ? "MDX + MDD" : "MDX"}
          </p>
        </div>
        <ConfirmPopover
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => onRemove(dictId)}
          title="Remove dictionary?"
          description="The original files will not be deleted."
          confirmLabel="Remove"
          variant="danger"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            className="rounded-[var(--radius-sm)] p-1.5 text-text-tertiary transition-all duration-[var(--duration-fast)] hover:bg-error/10 hover:text-error"
            aria-label="Remove dictionary"
          >
            <Trash2 size={14} />
          </button>
        </ConfirmPopover>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-3.5 py-3">
              <DictDetail dictId={dictId} dictMeta={dict} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── DictDetail (inline) ────────────────────────────────────

function DictDetail({ dictId, dictMeta }: { dictId: string; dictMeta: DictMeta }) {
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
    console.debug("[DictDetail] loading config for", dictId);
    api.getDictConfig(dictId).then((cfg) => {
      console.debug("[DictDetail] got config:", cfg);
      if (cfg.display_name) setDisplayName(cfg.display_name);
      if (cfg.custom_css) setCustomCss(cfg.custom_css);
      if (cfg.custom_js) setCustomJs(cfg.custom_js);
      if (cfg.css_paths?.length) setCssPaths(cfg.css_paths);
      if (cfg.js_paths?.length) setJsPaths(cfg.js_paths);
      if (cfg.extra_mdd_paths?.length) setMddPaths(cfg.extra_mdd_paths);
    }).catch((e) => {
      console.error("[DictDetail] getDictConfig failed:", e);
    });
  }, [dictId]);

  const handleAddMdd = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: true,
      filters: [{ name: "MDD Resource", extensions: ["mdd"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    setMddPaths((prev) => {
      const existing = new Set(prev);
      return [...prev, ...paths.filter((p) => typeof p === "string" && !existing.has(p))];
    });
  }, []);

  const removeMdd = useCallback((index: number) => {
    setMddPaths((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
    console.debug("[DictDetail] saving config:", dictId, payload);
    setSaving(true);
    try {
      await api.updateDictConfig(dictId, payload);
      console.debug("[DictDetail] save ok");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error("[DictDetail] save failed:", e);
    }
    setSaving(false);
  }, [dictId, displayName, dictMeta.title, customCss, customJs, cssPaths, jsPaths, mddPaths]);

  const inputCls =
    "h-8 w-full rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5 text-sm text-text-primary outline-none transition-colors duration-[var(--duration-fast)] focus:border-accent";
  const browseBtn =
    "flex h-8 shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-border px-2 text-xs font-medium text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken";

  return (
    <div className="space-y-3">
      {/* Info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-text-tertiary">Entries</span>
        <span className="text-text-primary">{dictMeta.word_count.toLocaleString()}</span>
        <span className="text-text-tertiary">Format</span>
        <span className="text-text-primary">{dictMeta.has_mdd ? "MDX + MDD" : "MDX only"}</span>
        {dictMeta.description && (
          <>
            <span className="text-text-tertiary">Description</span>
            <span className="truncate text-text-primary" title={dictMeta.description}>{dictMeta.description}</span>
          </>
        )}
      </div>

      {/* Display name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Display name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
      </div>

      {/* Extra MDD paths */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary">
            Extra MDD files <span className="font-normal text-text-tertiary">(optional)</span>
          </label>
          <button onClick={handleAddMdd} className="text-xs font-medium text-accent hover:underline">
            + Add
          </button>
        </div>
        {mddPaths.length > 0 ? (
          <div className="space-y-1">
            {mddPaths.map((p, i) => (
              <div key={p} className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border px-2.5 py-1.5">
                <FileText size={12} className="shrink-0 text-text-tertiary" />
                <span className="flex-1 truncate font-mono text-[11px] text-text-primary">{p.split("/").pop()}</span>
                <button onClick={() => removeMdd(i)} className="shrink-0 text-text-tertiary hover:text-error">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-text-tertiary">Auto-detected MDD files are used by default</p>
        )}
      </div>

      {/* CSS file paths */}
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          CSS files <span className="font-normal text-text-tertiary">(optional, multiple)</span>
        </label>
        <div className="flex flex-col gap-1">
          {cssPaths.map((p, i) => (
            <div key={i} className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5">
              <span className="flex-1 truncate font-mono text-[11px] text-text-primary">{p.split("/").pop() || p.split("\\").pop()}</span>
              <button onClick={() => setCssPaths(prev => prev.filter((_, idx) => idx !== i))} className="shrink-0 text-text-tertiary hover:text-text-secondary"><X size={11} /></button>
            </div>
          ))}
          {cssPaths.length === 0 && (
            <div className="flex h-8 items-center rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5">
              <span className="text-[11px] text-text-tertiary">None</span>
            </div>
          )}
          <button
            onClick={async () => {
              const selected = await open({ directory: false, multiple: true, filters: [{ name: "CSS", extensions: ["css"] }] });
              if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                setCssPaths(prev => [...new Set([...prev, ...paths])]);
              }
            }}
            className={browseBtn}
          >
            Add CSS
          </button>
        </div>
      </div>

      {/* JS file paths */}
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          JS files <span className="font-normal text-text-tertiary">(optional, multiple)</span>
        </label>
        <div className="flex flex-col gap-1">
          {jsPaths.map((p, i) => (
            <div key={i} className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5">
              <span className="flex-1 truncate font-mono text-[11px] text-text-primary">{p.split("/").pop() || p.split("\\").pop()}</span>
              <button onClick={() => setJsPaths(prev => prev.filter((_, idx) => idx !== i))} className="shrink-0 text-text-tertiary hover:text-text-secondary"><X size={11} /></button>
            </div>
          ))}
          {jsPaths.length === 0 && (
            <div className="flex h-8 items-center rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5">
              <span className="text-[11px] text-text-tertiary">None</span>
            </div>
          )}
          <button
            onClick={async () => {
              const selected = await open({ directory: false, multiple: true, filters: [{ name: "JavaScript", extensions: ["js"] }] });
              if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                setJsPaths(prev => [...new Set([...prev, ...paths])]);
              }
            }}
            className={browseBtn}
          >
            Add JS
          </button>
        </div>
      </div>

      {/* Custom CSS (inline) */}
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Custom CSS</label>
        <CodeEditor value={customCss} onChange={setCustomCss} language="css" placeholder="/* article styles */" minHeight={50} maxHeight={120} />
      </div>

      {/* Custom JS (inline) */}
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Custom JS</label>
        <CodeEditor value={customJs} onChange={setCustomJs} language="javascript" placeholder="// runs inside iframe" minHeight={50} maxHeight={120} />
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : saved ? (
            <>
              <Check size={12} />
              Saved
            </>
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}
