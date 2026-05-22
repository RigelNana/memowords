import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { LookupPage } from "./pages/LookupPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DictListPage } from "./pages/DictListPage";
import { DictImportPage } from "./pages/DictImportPage";
import { DictDetailPage } from "./pages/DictDetailPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LookupPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/dicts" element={<DictListPage />} />
          <Route path="settings/dicts/import" element={<DictImportPage />} />
          <Route path="settings/dicts/:id" element={<DictDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
