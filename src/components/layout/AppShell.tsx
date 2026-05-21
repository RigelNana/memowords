import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useUiStore } from "../../stores/uiStore";

export function AppShell() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-base">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
