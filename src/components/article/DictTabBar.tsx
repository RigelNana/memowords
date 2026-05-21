import { useCallback, useEffect, useRef, useState } from "react";

interface DictTabBarProps {
  dictNames: string[];
  activeIndex: number;
  onTabClick: (index: number) => void;
}

export function DictTabBar({
  dictNames,
  activeIndex,
  onTabClick,
}: DictTabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const tabs = container.querySelectorAll<HTMLButtonElement>("[data-tab]");
    const activeTab = tabs[activeIndex];
    if (!activeTab) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();

    setIndicatorStyle({
      left: tabRect.left - containerRect.left + container.scrollLeft,
      width: tabRect.width,
    });
  }, [activeIndex]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator, dictNames]);

  if (dictNames.length <= 1) return null;

  return (
    <div className="sticky top-0 z-[5] border-b border-border bg-surface-base">
      <div
        ref={containerRef}
        className="relative flex overflow-x-auto px-4"
        style={{ scrollbarWidth: "none" }}
      >
        {dictNames.map((name, i) => (
          <button
            key={name}
            data-tab
            onClick={() => onTabClick(i)}
            className={[
              "shrink-0 px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
              i === activeIndex
                ? "text-accent"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {name}
          </button>
        ))}

        {/* Sliding indicator */}
        <span
          className="absolute bottom-0 h-0.5 rounded-full bg-accent"
          style={{
            left: indicatorStyle.left,
            width: indicatorStyle.width,
            transition:
              "left 250ms cubic-bezier(0.16, 1, 0.3, 1), width 250ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
    </div>
  );
}
