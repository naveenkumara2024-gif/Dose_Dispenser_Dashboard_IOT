import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { AlertsResponse } from "@/types";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/schedule", label: "Schedule" },
  { to: "/history", label: "History" },
  { to: "/stock", label: "Stock" },
  { to: "/alerts", label: "Alerts" },
];

export function Layout() {
  const [alertCount, setAlertCount] = useState<number | null>(null);
  const location = useLocation();

  // Refetch on navigation so resolving an alert updates the badge.
  useEffect(() => {
    fetch("/api/alerts?limit=1")
      .then((res) => res.json() as Promise<AlertsResponse>)
      .then((data) => setAlertCount(data.total))
      .catch(() => setAlertCount(null));
  }, [location.pathname]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Pill Dispenser</h1>
        <nav className="mt-3 flex gap-1 border-b">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`
              }
            >
              {link.label}
              {link.to === "/alerts" && alertCount !== null && alertCount > 0 && (
                <span
                  className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900"
                  data-testid="alert-badge"
                >
                  {alertCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
