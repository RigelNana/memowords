import { useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "../search/CommandPalette";
import { useUiStore } from "../../stores/uiStore";
import { useHotkey } from "../../hooks/useHotkey";

export function AppShell() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const openCommandPalette = useUiStore((s) => s.openCommandPalette);

  useHotkey({
    key: "k",
    modifiers: ["meta"],
    handler: useCallback(() => openCommandPalette(), [openCommandPalette]),
  });

  useHotkey({
    key: "\\",
    modifiers: ["meta"],
    handler: useCallback(() => toggleSidebar(), [toggleSidebar]),
  });

  return (
    <div className="flex h-screen overflow-hidden bg-surface-base">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
