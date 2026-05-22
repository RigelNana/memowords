interface CandidateItemProps {
  headword: string;
  isActive: boolean;
  index: number;
  onClick: () => void;
}

export function CandidateItem({
  headword,
  isActive,
  onClick,
}: CandidateItemProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "relative flex h-9 w-full items-center px-4 text-left text-base",
        isActive
          ? "bg-accent-subtle font-medium text-accent"
          : "text-text-primary hover:bg-surface-sunken",
      ].join(" ")}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
      )}
      <span className="truncate">{headword}</span>
    </button>
  );
}
