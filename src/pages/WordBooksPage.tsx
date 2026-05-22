import { BookMarked } from "lucide-react";

export function WordBooksPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-accent-subtle">
        <BookMarked size={24} className="text-accent" />
      </div>
      <h2 className="text-lg font-semibold text-text-primary">Word Books</h2>
      <p className="max-w-xs text-center text-sm text-text-tertiary">
        Create word books to collect and organize vocabulary. This feature is coming soon.
      </p>
    </div>
  );
}
