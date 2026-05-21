interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-surface-sunken ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, transparent 0%, oklch(0.975 0.008 270 / 0.6) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s ease-in-out infinite",
      }}
    />
  );
}
