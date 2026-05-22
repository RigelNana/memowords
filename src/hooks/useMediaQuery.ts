import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    mql.addEventListener("change", handler);
    setMatches(mql.matches);

    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

// Breakpoints matching DESIGN_SPEC
export function useBreakpoint() {
  const isLarge = useMediaQuery("(min-width: 1200px)");
  const isMedium = useMediaQuery("(min-width: 900px)");

  if (isLarge) return "large" as const;
  if (isMedium) return "medium" as const;
  return "small" as const;
}
