import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AlertsPage } from "@/pages/AlertsPage";
import { Home } from "@/pages/Home";
import { HistoryPage } from "@/pages/HistoryPage";
import { SchedulePage } from "@/pages/SchedulePage";
import { StockPage } from "@/pages/StockPage";
import "./index.css";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="alerts" element={<AlertsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
