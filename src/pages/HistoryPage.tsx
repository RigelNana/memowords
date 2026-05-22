import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useHistoryStore, type HistoryEntry } from "../stores/historyStore";
import { useSearchStore } from "../stores/searchStore";

export function HistoryPage() {
  const entries = useHistoryStore((s) => s.entries);
  const clearAll = useHistoryStore((s) => s.clearAll);
  const removeEntry = useHistoryStore((s) => s.removeEntry);
  const lookup = useSearchStore((s) => s.lookup);
  const setQuery = useSearchStore((s) => s.setQuery);
  const navigate = useNavigate();

  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = useCallback(
    (word: string) => {
      setQuery(word);
      lookup(word);
      navigate("/");
    },
    [setQuery, lookup, navigate],
  );

  const grouped = groupByDate(entries);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-5">
        <h1 className="text-[1.2rem] font-semibold text-text-primary">
          History
        </h1>
        {entries.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowConfirm(!showConfirm)}
              className="rounded-[var(--radius-sm)] px-3 py-1.5 text-sm text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken hover:text-error"
            >
              Clear All
            </button>
            <AnimatePresence>
              {showConfirm && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 top-full z-10 mt-1 w-48 rounded-[var(--radius-md)] border border-border bg-surface-overlay p-2"
                >
                  <p className="mb-2 text-xs text-text-secondary">
                    Clear all history?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="flex-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-text-secondary hover:bg-surface-sunken"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        clearAll();
                        setShowConfirm(false);
                      }}
                      className="flex-1 rounded-[var(--radius-sm)] bg-error/10 px-2 py-1 text-xs font-medium text-error hover:bg-error/20"
                    >
                      Clear
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-text-tertiary">No lookup history yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {grouped.map(({ label, items }) => (
            <div key={label} className="px-5">
              <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {label}
              </p>
              {items.map(({ entry, globalIndex }) => (
                <div
                  key={`${entry.word}-${entry.timestamp}`}
                  className="group flex h-10 items-center gap-3 border-b border-border transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken"
                >
                  <button
                    onClick={() => handleClick(entry.word)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span className="text-base text-text-primary">
                      {entry.word}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {entry.dictNames.join(", ")}
                    </span>
                  </button>
                  <span className="text-xs text-text-tertiary">
                    {formatTime(entry.timestamp)}
                  </span>
                  <button
                    onClick={() => removeEntry(globalIndex)}
                    className="ml-1 rounded p-1 text-text-tertiary opacity-0 transition-opacity duration-[var(--duration-fast)] hover:text-error group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Group entries by date label
function groupByDate(entries: HistoryEntry[]) {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterdayStart = todayStart - 86400000;

  const groups: {
    label: string;
    items: { entry: HistoryEntry; globalIndex: number }[];
  }[] = [];

  let currentLabel = "";
  let currentItems: { entry: HistoryEntry; globalIndex: number }[] = [];

  entries.forEach((entry, i) => {
    let label: string;
    if (entry.timestamp >= todayStart) {
      label = "Today";
    } else if (entry.timestamp >= yesterdayStart) {
      label = "Yesterday";
    } else {
      label = new Date(entry.timestamp).toLocaleDateString();
    }

    if (label !== currentLabel) {
      if (currentItems.length > 0) {
        groups.push({ label: currentLabel, items: currentItems });
      }
      currentLabel = label;
      currentItems = [];
    }
    currentItems.push({ entry, globalIndex: i });
  });

  if (currentItems.length > 0) {
    groups.push({ label: currentLabel, items: currentItems });
  }

  return groups;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}
