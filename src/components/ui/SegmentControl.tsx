import { useCallback, useEffect, useRef, useState } from "react";

interface SegmentControlProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export function SegmentControl({
  value,
  options,
  onChange,
}: SegmentControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    width: 0,
  });

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const buttons =
      container.querySelectorAll<HTMLButtonElement>("[data-segment]");
    const activeIndex = options.findIndex((o) => o.value === value);
    const btn = buttons[activeIndex];
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    setIndicatorStyle({
      left: rect.left - containerRect.left,
      width: rect.width,
    });
  }, [value, options]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex h-8 items-center rounded-[var(--radius-sm)] bg-surface-sunken p-0.5"
    >
      {/* Sliding indicator */}
      <span
        className="absolute top-0.5 h-[calc(100%-4px)] rounded-[calc(var(--radius-sm)-2px)] bg-surface-base"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
          transition:
            "left 200ms cubic-bezier(0.16, 1, 0.3, 1), width 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />

      {options.map((opt) => (
        <button
          key={opt.value}
          data-segment
          onClick={() => onChange(opt.value)}
          className={[
            "relative z-[1] px-3 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
            opt.value === value
              ? "text-text-primary"
              : "text-text-tertiary hover:text-text-secondary",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
