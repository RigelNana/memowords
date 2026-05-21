import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { LookupPage } from "./pages/LookupPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LookupPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
