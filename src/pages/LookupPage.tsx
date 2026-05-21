import { Search } from "lucide-react";

export function LookupPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Search bar */}
      <div className="border-b border-border px-5 py-3">
        <div className="bg-surface-sunken flex h-11 items-center gap-3 rounded-[var(--radius-sm)] px-4">
          <Search size={18} className="text-text-tertiary" />
          <span className="text-text-tertiary text-base">
            Search dictionaries...
          </span>
          <kbd className="bg-surface-base text-text-tertiary ml-auto rounded-[4px] border border-border px-1.5 py-0.5 text-xs font-medium">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Placeholder content */}
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-text-secondary text-base">
            Type a word to look it up
          </p>
          <p className="text-text-tertiary mt-1 text-sm">
            Press ⌘K to start searching
          </p>
        </div>
      </div>
    </div>
  );
}
