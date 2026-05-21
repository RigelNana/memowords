import { useEffect } from "react";

type Modifier = "meta" | "ctrl" | "shift" | "alt";

interface HotkeyConfig {
  key: string;
  modifiers?: Modifier[];
  handler: (e: KeyboardEvent) => void;
  enabled?: boolean;
}

export function useHotkey({
  key,
  modifiers = [],
  handler,
  enabled = true,
}: HotkeyConfig) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;

      const requireMeta = modifiers.includes("meta");
      const requireCtrl = modifiers.includes("ctrl");
      const requireShift = modifiers.includes("shift");
      const requireAlt = modifiers.includes("alt");

      // Accept either meta or ctrl for cross-platform ⌘/Ctrl
      const metaOrCtrl = requireMeta || requireCtrl;
      if (metaOrCtrl && !(e.metaKey || e.ctrlKey)) return;
      if (requireShift && !e.shiftKey) return;
      if (requireAlt && !e.altKey) return;

      // Reject if extra modifiers pressed
      if (!metaOrCtrl && (e.metaKey || e.ctrlKey)) return;
      if (!requireShift && e.shiftKey) return;
      if (!requireAlt && e.altKey) return;

      e.preventDefault();
      handler(e);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [key, modifiers, handler, enabled]);
}
