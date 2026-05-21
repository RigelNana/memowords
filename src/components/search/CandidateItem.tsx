import { motion } from "framer-motion";

interface CandidateItemProps {
  headword: string;
  isActive: boolean;
  index: number;
  onClick: () => void;
}

export function CandidateItem({
  headword,
  isActive,
  index,
  onClick,
}: CandidateItemProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.15,
        ease: [0.16, 1, 0.3, 1],
        delay: Math.min(index, 8) * 0.03,
      }}
      onClick={onClick}
      className={[
        "relative flex h-9 w-full items-center px-4 text-left text-base transition-colors duration-[var(--duration-fast)]",
        isActive
          ? "bg-accent-subtle font-medium text-accent"
          : "text-text-primary hover:bg-surface-sunken",
      ].join(" ")}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
      )}
      <span className="truncate">{headword}</span>
    </motion.button>
  );
}
