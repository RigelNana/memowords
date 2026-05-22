import { BookOpen } from "lucide-react";

export function ReviewPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] bg-accent-subtle">
        <BookOpen size={24} className="text-accent" />
      </div>
      <h2 className="text-lg font-semibold text-text-primary">Review</h2>
      <p className="max-w-xs text-center text-sm text-text-tertiary">
        Spaced repetition review is coming soon. Add words to your word books to get started.
      </p>
    </div>
  );
}
