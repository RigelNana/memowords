import { useCallback, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useSearchStore } from "../../stores/searchStore";
import { useDictStore } from "../../stores/dictStore";
import { useDebouncedCallback } from "../../hooks/useDebounce";

export function SearchBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const search = useSearchStore((s) => s.search);
  const clear = useSearchStore((s) => s.clear);
  const moveSelection = useSearchStore((s) => s.moveSelection);
  const selectCandidate = useSearchStore((s) => s.selectCandidate);
  const selectedIndex = useSearchStore((s) => s.selectedIndex);
  const activeGroupId = useDictStore((s) => s.activeGroupId);

  const debouncedSearch = useDebouncedCallback((q: string) => {
    search(q, activeGroupId ?? undefined);
  }, 200);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      debouncedSearch(value);
    },
    [setQuery, debouncedSearch],
  );

  const handleClear = useCallback(() => {
    clear();
    inputRef.current?.focus();
  }, [clear]);

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
          selectCandidate(selectedIndex);
          break;
        case "Escape":
          e.preventDefault();
          if (query) {
            clear();
          } else {
            inputRef.current?.blur();
          }
          break;
      }
    },
    [moveSelection, selectCandidate, selectedIndex, query, clear],
  );

  // Focus on `/` key when no input is focused
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="sticky top-0 z-10 border-b border-border bg-surface-base px-5 py-2.5">
      <div className="flex h-11 items-center gap-3">
        <Search size={18} className="shrink-0 text-text-tertiary" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search dictionaries..."
          className="flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-tertiary"
        />
        {query && (
          <button
            onClick={handleClear}
            className="shrink-0 rounded-[var(--radius-sm)] p-1 text-text-tertiary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken hover:text-text-secondary"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
