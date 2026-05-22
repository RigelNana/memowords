import { useEffect, useRef, useState } from "react";
import { ChevronUp, Library } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDictStore } from "../../stores/dictStore";

interface DictGroupSwitcherProps {
  collapsed: boolean;
}

export function DictGroupSwitcher({ collapsed }: DictGroupSwitcherProps) {
  const groups = useDictStore((s) => s.groups);
  const activeGroupId = useDictStore((s) => s.activeGroupId);
  const setActiveGroup = useDictStore((s) => s.setActiveGroup);
  const loadGroups = useDictStore((s) => s.loadGroups);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeGroup = groups.find(
    (g) => g.id["0"] === activeGroupId,
  );

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const labelStyle = {
    opacity: collapsed ? 0 : 1,
    transition: `opacity var(--duration-fast) var(--ease-out-quart)`,
  } as const;

  return (
    <div ref={containerRef} className="relative mx-2 mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center gap-2 overflow-hidden rounded-[var(--radius-sm)] px-3 text-sm text-text-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-sunken"
      >
        <Library size={16} className="shrink-0" />
        <span
          className="flex-1 truncate whitespace-nowrap text-left font-medium"
          style={labelStyle}
        >
          {activeGroup ? activeGroup.name : "All Dicts"}
        </span>
        <ChevronUp
          size={14}
          className="shrink-0 text-text-tertiary"
          style={{
            opacity: collapsed ? 0 : 1,
            transform: open ? "rotate(0deg)" : "rotate(180deg)",
            transition:
              "transform 200ms cubic-bezier(0.25, 1, 0.5, 1), opacity var(--duration-fast) var(--ease-out-quart)",
          }}
        />
      </button>

      <AnimatePresence>
        {open && !collapsed && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.2,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="absolute bottom-full left-0 mb-1 w-full rounded-[var(--radius-md)] border border-border bg-surface-overlay p-1"
          >
            {/* All dicts option */}
            <button
              onClick={() => {
                setActiveGroup(null);
                setOpen(false);
              }}
              className={[
                "flex h-8 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm transition-colors duration-[var(--duration-fast)]",
                activeGroupId === null
                  ? "bg-accent-subtle text-accent"
                  : "text-text-primary hover:bg-surface-sunken",
              ].join(" ")}
            >
              {activeGroupId === null && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              )}
              <span>All Dicts</span>
            </button>

            {groups.map((group) => (
              <button
                key={group.id["0"]}
                onClick={() => {
                  setActiveGroup(group.id["0"]);
                  setOpen(false);
                }}
                className={[
                  "flex h-8 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm transition-colors duration-[var(--duration-fast)]",
                  activeGroupId === group.id["0"]
                    ? "bg-accent-subtle text-accent"
                    : "text-text-primary hover:bg-surface-sunken",
                ].join(" ")}
              >
                {activeGroupId === group.id["0"] && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                )}
                <span className="truncate">{group.name}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
