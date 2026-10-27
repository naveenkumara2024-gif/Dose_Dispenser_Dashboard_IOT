import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { LiveProvider } from "@/lib/live";
import { AlertsPage } from "@/pages/AlertsPage";
import { Home } from "@/pages/Home";
import { HistoryPage } from "@/pages/HistoryPage";
import { SchedulePage } from "@/pages/SchedulePage";
import { StockPage } from "@/pages/StockPage";
import "./index.css";

export function App() {
  return (
    <BrowserRouter>
      <LiveProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="stock" element={<StockPage />} />
            {/* sensors now live on the dashboard; keep old bookmarks working */}
            <Route path="sensors" element={<Navigate to="/" replace />} />
            <Route path="alerts" element={<AlertsPage />} />
          </Route>
        </Routes>
      </LiveProvider>
    </BrowserRouter>
  );
}

export default App;
