import { useEffect } from "react";
import { useSearchStore } from "../../stores/searchStore";
import { useScrollIntoView } from "../../hooks/useScrollIntoView";
import { CandidateItem } from "./CandidateItem";
import { Skeleton } from "../ui/Skeleton";

export function CandidateList() {
  const candidates = useSearchStore((s) => s.candidates);
  const selectedIndex = useSearchStore((s) => s.selectedIndex);
  const isSearching = useSearchStore((s) => s.isSearching);
  const selectCandidate = useSearchStore((s) => s.selectCandidate);
  const query = useSearchStore((s) => s.query);

  const { containerRef, scrollToIndex } =
    useScrollIntoView<HTMLDivElement>();

  useEffect(() => {
    scrollToIndex(selectedIndex);
  }, [selectedIndex, scrollToIndex]);

  if (!query.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-center text-sm text-text-tertiary">
          Type to search
        </p>
      </div>
    );
  }

  if (isSearching) {
    return (
      <div className="flex flex-col gap-1 p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-[var(--radius-sm)]" />
        ))}
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-4">
        <p className="text-sm text-text-secondary">No matches found</p>
        <p className="text-xs text-text-tertiary">
          Try a different spelling
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto py-1"
      style={{ scrollbarWidth: "thin" }}
    >
      {candidates.map((c, i) => (
        <CandidateItem
          key={`${c.headword}-${c.dict_id}`}
          headword={c.headword}
          isActive={i === selectedIndex}
          index={i}
          onClick={() => selectCandidate(i, true)}
        />
      ))}
    </div>
  );
}
