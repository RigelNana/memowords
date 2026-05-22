import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { LookupPage } from "./pages/LookupPage";
import { ReviewPage } from "./pages/ReviewPage";
import { WordBooksPage } from "./pages/WordBooksPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LookupPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="wordbooks" element={<WordBooksPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
