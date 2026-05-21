import { NavLink } from "react-router-dom";
import { Search, BookOpen, History, Settings, ChevronLeft, BookMarked } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { to: "/", icon: Search, label: "Lookup" },
  { to: "/review", icon: BookOpen, label: "Review" },
  { to: "/wordbooks", icon: BookMarked, label: "Word Books" },
  { to: "/history", icon: History, label: "History" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const openCommandPalette = useUiStore((s) => s.openCommandPalette);

  return (
    <aside
      className="flex h-full flex-col border-r border-border bg-surface-raised"
      style={{
        width: collapsed ? 56 : 240,
        transition: `width var(--duration-slow) var(--ease-out-expo)`,
      }}
    >
      {/* Logo */}
      <div className="flex h-12 items-center gap-2 px-4">
        <span className="text-accent text-lg font-semibold">◆</span>
        {!collapsed && (
          <span className="text-text-primary text-sm font-semibold tracking-tight">
            MemoWords
          </span>
        )}
      </div>

      {/* Search trigger */}
      <button
        onClick={openCommandPalette}
        className="mx-2 mt-2 flex h-10 items-center gap-3 rounded-[var(--radius-sm)] bg-surface-sunken px-3 text-sm text-text-tertiary transition-colors duration-[var(--duration-fast)] hover:bg-surface-base"
      >
        <Search size={16} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search...</span>
            <kbd className="rounded border border-border bg-surface-base px-1.5 py-0.5 text-[10px] font-medium">
              ⌘K
            </kbd>
          </>
        )}
      </button>

      {/* Navigation */}
      <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              [
                "relative flex h-9 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm font-medium",
                `transition-colors duration-[var(--duration-fast)]`,
                isActive
                  ? "bg-accent-subtle text-accent"
                  : "text-text-secondary hover:bg-surface-sunken",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="bg-accent absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full" />
                )}
                <Icon size={18} />
                {!collapsed && <span>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="text-text-tertiary hover:text-text-secondary m-2 flex h-8 items-center justify-center rounded-[var(--radius-sm)] hover:bg-surface-sunken"
        style={{
          transition: `color var(--duration-fast) var(--ease-out-quart), background-color var(--duration-fast) var(--ease-out-quart)`,
        }}
      >
        <ChevronLeft
          size={16}
          style={{
            transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
            transition: `transform var(--duration-normal) var(--ease-out-quart)`,
          }}
        />
      </button>
    </aside>
  );
}
