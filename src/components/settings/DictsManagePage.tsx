import { useCallback, useEffect, useState } from "react";
import { Plus, BookOpen, Trash2 } from "lucide-react";
import { useDictStore } from "../../stores/dictStore";
import { api } from "../../lib/tauri";
import { ConfirmPopover } from "../ui/ConfirmPopover";
import { DictDetailPanel } from "./DictDetailPanel";
import { ImportDictModal } from "./ImportDictModal";
import type { DictMeta } from "../../types";

/**
 * Dictionary management page — master-detail split layout.
 * Left: scrollable dict list.
 * Right: detail/edit panel for selected dict.
 */
export function DictsManagePage() {
  const dicts = useDictStore((s) => s.dicts);
  const loadDicts = useDictStore((s) => s.loadDicts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    loadDicts();
  }, [loadDicts]);

  // Auto-select first if nothing selected
  useEffect(() => {
    if (!selectedId && dicts.length > 0) {
      setSelectedId(dicts[0].id);
    }
  }, [dicts, selectedId]);

  const handleRemove = useCallback(
    async (id: string) => {
      try {
        await api.removeDict(id);
        if (selectedId === id) setSelectedId(null);
        loadDicts();
      } catch (e) {
        console.error("Failed to remove dict:", e);
      }
    },
    [selectedId, loadDicts],
  );

  const handleImportDone = useCallback(() => {
    setShowImport(false);
    loadDicts();
  }, [loadDicts]);

  const selectedDict = dicts.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      {/* ── Left: Dict list ── */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Dictionaries
            {dicts.length > 0 && (
              <span className="ml-1.5 font-normal normal-case text-text-tertiary">
                ({dicts.length})
              </span>
            )}
          </span>
          <button
            onClick={() => setShowImport(true)}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken hover:text-accent"
            aria-label="Add dictionary"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: "thin" }}>
          {dicts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
              <BookOpen size={24} className="text-text-tertiary" />
              <p className="text-center text-xs text-text-tertiary">
                No dictionaries added yet
              </p>
              <button
                onClick={() => setShowImport(true)}
                className="mt-1 flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-2.5 text-xs font-medium text-white hover:bg-accent/90"
              >
                <Plus size={12} />
                Add
              </button>
            </div>
          ) : (
            dicts.map((dict) => (
              <DictListItem
                key={dict.id}
                dict={dict}
                isActive={dict.id === selectedId}
                onSelect={() => setSelectedId(dict.id)}
                onRemove={handleRemove}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: Detail panel ── */}
      <div className="flex-1 overflow-y-auto">
        {selectedDict ? (
          <DictDetailPanel dictId={selectedDict.id} dictMeta={selectedDict} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-tertiary">Select a dictionary to view details</p>
          </div>
        )}
      </div>

      {/* ── Import Modal ── */}
      {showImport && (
        <ImportDictModal
          onClose={() => setShowImport(false)}
          onDone={handleImportDone}
        />
      )}
    </div>
  );
}

// ── DictListItem ──────────────────────────────────────────

function DictListItem({
  dict,
  isActive,
  onSelect,
  onRemove,
}: {
  dict: DictMeta;
  isActive: boolean;
  onSelect: () => void;
  onRemove: (id: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      onClick={onSelect}
      className={[
        "group relative mx-1 flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2",
        isActive
          ? "bg-accent-subtle text-accent"
          : "text-text-primary hover:bg-surface-sunken",
      ].join(" ")}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-subtle text-[11px] font-semibold text-accent">
        {dict.title.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 overflow-hidden">
        <p className="truncate text-sm font-medium">{dict.title}</p>
        <p className="text-[11px] text-text-tertiary">
          {dict.word_count.toLocaleString()} entries
        </p>
      </div>
      {/* Remove button — shows on hover */}
      <ConfirmPopover
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => onRemove(dict.id)}
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
          className="rounded p-1 text-text-tertiary opacity-0 transition-all duration-[var(--duration-fast)] hover:bg-error/10 hover:text-error group-hover:opacity-100"
          aria-label="Remove"
        >
          <Trash2 size={12} />
        </button>
      </ConfirmPopover>
    </div>
  );
}
