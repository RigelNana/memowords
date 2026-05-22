import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ConfirmPopover } from "../ui/ConfirmPopover";
import type { DictMeta } from "../../types";

interface DictCardProps {
  dict: DictMeta;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

export function DictCard({ dict, onEdit, onRemove }: DictCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const initial = dict.title.charAt(0).toUpperCase();

  return (
    <div className="group flex gap-4 rounded-[var(--radius-md)] border border-border bg-surface-raised p-4 transition-colors duration-[var(--duration-fast)] hover:border-accent/30">
      {/* Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-subtle text-lg font-semibold text-accent">
        {initial}
      </div>

      {/* Info */}
      <div className="flex-1">
        <h3 className="text-base font-medium text-text-primary">
          {dict.title}
        </h3>
        <p className="mt-0.5 text-sm text-text-secondary">
          {dict.word_count.toLocaleString()} entries
          <span className="mx-1.5 text-text-tertiary">•</span>
          {dict.has_mdd ? "MDX + MDD" : "MDX only"}
        </p>
        {dict.description && (
          <p className="mt-0.5 text-xs text-text-tertiary">
            {dict.description}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-start gap-1 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100">
        <button
          onClick={() => onEdit(dict.id)}
          className="rounded-[var(--radius-sm)] p-2 text-text-tertiary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken hover:text-text-primary"
          aria-label="Edit dictionary"
        >
          <Pencil size={16} />
        </button>

        <ConfirmPopover
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => onRemove(dict.id)}
          title="Remove dictionary?"
          description="This will remove the dictionary from the app. The original files will not be deleted."
          confirmLabel="Remove"
          variant="danger"
        >
          <button
            onClick={() => setConfirmOpen(true)}
            className="rounded-[var(--radius-sm)] p-2 text-text-tertiary transition-colors duration-[var(--duration-fast)] hover:bg-error/10 hover:text-error"
            aria-label="Remove dictionary"
          >
            <Trash2 size={16} />
          </button>
        </ConfirmPopover>
      </div>
    </div>
  );
}
