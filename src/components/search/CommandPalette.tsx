import { useCallback, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useUiStore } from "../../stores/uiStore";
import { useSearchStore } from "../../stores/searchStore";
import { useDictStore } from "../../stores/dictStore";
import { useDebouncedCallback } from "../../hooks/useDebounce";
import { CandidateItem } from "./CandidateItem";

export function CommandPalette() {
  const isOpen = useUiStore((s) => s.commandPaletteOpen);
  const close = useUiStore((s) => s.closeCommandPalette);

  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const search = useSearchStore((s) => s.search);
  const candidates = useSearchStore((s) => s.candidates);
  const selectedIndex = useSearchStore((s) => s.selectedIndex);
  const selectCandidate = useSearchStore((s) => s.selectCandidate);
  const moveSelection = useSearchStore((s) => s.moveSelection);
  const lookup = useSearchStore((s) => s.lookup);
  const activeGroupId = useDictStore((s) => s.activeGroupId);

  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebouncedCallback((q: string) => {
    search(q, activeGroupId ?? undefined);
  }, 150);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      debouncedSearch(value);
    },
    [setQuery, debouncedSearch],
  );

  const handleConfirm = useCallback(() => {
    if (candidates.length > 0) {
      const word = candidates[selectedIndex]?.headword;
      if (word) {
        lookup(word, activeGroupId ?? undefined);
        navigate("/");
        close();
      }
    }
  }, [candidates, selectedIndex, lookup, activeGroupId, navigate, close]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveSelection("down");
          break;
        case "ArrowUp":
          e.preventDefault();
          moveSelection("up");
          break;
        case "Enter":
          e.preventDefault();
          handleConfirm();
          break;
        case "Escape":
          e.preventDefault();
          close();
          break;
      }
    },
    [moveSelection, handleConfirm, close],
  );

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) close();
    },
    [close],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 flex justify-center"
          style={{
            backgroundColor: "oklch(0.205 0.012 270 / 0.4)",
            paddingTop: "20vh",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{
              duration: 0.25,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="flex h-fit max-h-[420px] w-[560px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-overlay"
          >
            {/* Input */}
            <div className="flex h-[52px] items-center gap-3 border-b border-border px-4">
              <Search size={18} className="shrink-0 text-text-tertiary" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Type to search dictionaries..."
                className="flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </div>

            {/* Results */}
            {candidates.length > 0 && (
              <div
                className="flex-1 overflow-y-auto py-1"
                style={{ scrollbarWidth: "thin" }}
              >
                {candidates.slice(0, 10).map((c, i) => (
                  <CandidateItem
                    key={`${c.headword}-${c.dict_id}`}
                    headword={c.headword}
                    isActive={i === selectedIndex}
                    index={i}
                    onClick={() => {
                      selectCandidate(i);
                      handleConfirm();
                    }}
                  />
                ))}
              </div>
            )}

            {/* Footer hints */}
            <div className="flex items-center gap-4 border-t border-border px-4 py-2">
              <span className="text-xs text-text-tertiary">
                <kbd className="rounded border border-border bg-surface-sunken px-1 py-0.5 font-mono text-[10px]">
                  ↑↓
                </kbd>{" "}
                Navigate
              </span>
              <span className="text-xs text-text-tertiary">
                <kbd className="rounded border border-border bg-surface-sunken px-1 py-0.5 font-mono text-[10px]">
                  ↵
                </kbd>{" "}
                Open
              </span>
              <span className="text-xs text-text-tertiary">
                <kbd className="rounded border border-border bg-surface-sunken px-1 py-0.5 font-mono text-[10px]">
                  esc
                </kbd>{" "}
                Close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
