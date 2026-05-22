import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, GripVertical, Loader2 } from "lucide-react";
import { api } from "../../lib/tauri";
import { useDictStore } from "../../stores/dictStore";
import { ConfirmPopover } from "../ui/ConfirmPopover";
import type { DictGroup } from "../../types";

/**
 * Group management page — CRUD groups + reorder dictionaries within groups.
 */
export function GroupsManagePage() {
  const dicts = useDictStore((s) => s.dicts);
  const loadDicts = useDictStore((s) => s.loadDicts);
  const [groups, setGroups] = useState<DictGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // New/edit group
  const [editingId, setEditingId] = useState<string | null>(null); // null = creating new
  const [editName, setEditName] = useState("");
  const [editDictIds, setEditDictIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const g = await api.listGroups();
      setGroups(g);
    } catch (e) {
      console.error("Failed to load groups:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadGroups();
    loadDicts();
  }, [loadGroups, loadDicts]);

  // ── CRUD ─────────────────────────────────────────────────

  const startCreate = useCallback(() => {
    setEditingId(null);
    setEditName("");
    setEditDictIds([]);
    setIsEditing(true);
  }, []);

  const startEdit = useCallback((group: DictGroup) => {
    setEditingId(group.id);
    setEditName(group.name);
    setEditDictIds([...group.dict_ids]);
    setIsEditing(true);
    setSelectedGroupId(group.id);
  }, []);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditingId(null);
    setEditName("");
    setEditDictIds([]);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.updateGroup(editingId, editName.trim(), editDictIds);
      } else {
        await api.createGroup(editName.trim(), editDictIds);
      }
      await loadGroups();
      cancelEdit();
    } catch (e) {
      console.error("Failed to save group:", e);
    }
    setSaving(false);
  }, [editingId, editName, editDictIds, loadGroups, cancelEdit]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await api.deleteGroup(id);
        if (selectedGroupId === id) setSelectedGroupId(null);
        await loadGroups();
      } catch (e) {
        console.error("Failed to delete group:", e);
      }
    },
    [selectedGroupId, loadGroups],
  );

  // ── Dict ordering ────────────────────────────────────────

  const toggleDict = useCallback((dictId: string) => {
    setEditDictIds((prev) =>
      prev.includes(dictId) ? prev.filter((d) => d !== dictId) : [...prev, dictId],
    );
  }, []);

  const moveDictUp = useCallback((index: number) => {
    if (index <= 0) return;
    setEditDictIds((prev) => {
      const copy = [...prev];
      [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
      return copy;
    });
  }, []);

  const moveDictDown = useCallback((index: number) => {
    setEditDictIds((prev) => {
      if (index >= prev.length - 1) return prev;
      const copy = [...prev];
      [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
      return copy;
    });
  }, []);

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* Left: Group list */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Groups
          </span>
          <button
            onClick={startCreate}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-text-tertiary hover:bg-surface-sunken hover:text-accent"
            aria-label="New group"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: "thin" }}>
          {groups.length === 0 && !loading ? (
            <p className="px-4 py-6 text-center text-xs text-text-tertiary">
              No groups yet
            </p>
          ) : (
            groups.map((g) => (
              <div
                key={g.id}
                onClick={() => startEdit(g)}
                className={[
                  "group mx-1 flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2",
                  selectedGroupId === g.id
                    ? "bg-accent-subtle text-accent"
                    : "text-text-primary hover:bg-surface-sunken",
                ].join(" ")}
              >
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium">{g.name}</p>
                  <p className="text-[11px] text-text-tertiary">
                    {g.dict_ids.length} {g.dict_ids.length === 1 ? "dict" : "dicts"}
                  </p>
                </div>
                <ConfirmPopover
                  open={false}
                  onClose={() => {}}
                  onConfirm={() => handleDelete(g.id)}
                  title="Delete group?"
                  description="Dictionaries will not be removed."
                  confirmLabel="Delete"
                  variant="danger"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(g.id);
                    }}
                    className="rounded p-1 text-text-tertiary opacity-0 hover:text-error group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </ConfirmPopover>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Edit panel */}
      <div className="flex-1 overflow-y-auto p-5">
        {isEditing ? (
          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-text-primary">
              {editingId ? "Edit Group" : "New Group"}
            </h2>

            {/* Group name */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                Group Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. English Learning"
                className="h-8 w-full max-w-xs rounded-[var(--radius-sm)] border border-border bg-surface-base px-2.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
                autoFocus
              />
            </div>

            {/* Dict selection + ordering */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                Dictionaries (drag to reorder)
              </label>

              {/* Selected dicts in order */}
              {editDictIds.length > 0 && (
                <div className="mb-3 space-y-1 rounded-[var(--radius-md)] border border-border p-2">
                  {editDictIds.map((dictId, i) => {
                    const d = dicts.find((dd) => dd.id === dictId);
                    if (!d) return null;
                    return (
                      <div
                        key={dictId}
                        className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-surface-sunken px-2.5 py-1.5"
                      >
                        <GripVertical size={12} className="shrink-0 text-text-tertiary" />
                        <span className="flex-1 truncate text-sm text-text-primary">
                          {d.title}
                        </span>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => moveDictUp(i)}
                            disabled={i === 0}
                            className="px-1 text-[10px] text-text-tertiary hover:text-accent disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveDictDown(i)}
                            disabled={i === editDictIds.length - 1}
                            className="px-1 text-[10px] text-text-tertiary hover:text-accent disabled:opacity-30"
                          >
                            ▼
                          </button>
                        </div>
                        <button
                          onClick={() => toggleDict(dictId)}
                          className="text-xs text-text-tertiary hover:text-error"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Available dicts to add */}
              <div className="space-y-1">
                {dicts
                  .filter((d) => !editDictIds.includes(d.id))
                  .map((d) => (
                    <button
                      key={d.id}
                      onClick={() => toggleDict(d.id)}
                      className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
                    >
                      <Plus size={12} className="text-text-tertiary" />
                      <span className="truncate">{d.title}</span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={cancelEdit}
                className="h-8 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-text-secondary hover:bg-surface-sunken"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editName.trim()}
                className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-4 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {saving && <Loader2 size={12} className="animate-spin" />}
                {editingId ? "Save" : "Create"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-text-tertiary">
                Select a group to edit, or create a new one
              </p>
              <button
                onClick={startCreate}
                className="mt-3 flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-medium text-white hover:bg-accent/90"
              >
                <Plus size={12} />
                New Group
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
