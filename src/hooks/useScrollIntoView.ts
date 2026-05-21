import { useCallback, useRef } from "react";

export function useScrollIntoView<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);

  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;

    const items = container.children;
    const item = items[index] as HTMLElement | undefined;
    if (!item) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    const margin = 4;

    if (itemRect.top < containerRect.top + margin) {
      item.scrollIntoView({ block: "start", behavior: "smooth" });
    } else if (itemRect.bottom > containerRect.bottom - margin) {
      item.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, []);

  return { containerRef, scrollToIndex };
}
