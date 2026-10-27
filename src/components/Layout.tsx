import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ChevronRight, Moon, Pill, Sun } from "lucide-react";
import { AlertPopup, VibrationToast } from "@/components/AlertPopup";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useLiveRefresh } from "@/lib/live";
import { useTheme } from "@/lib/theme";
import type { AlertsResponse } from "@/types";

const NAV_LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/schedule", label: "Schedule" },
  { to: "/history", label: "History" },
  { to: "/stock", label: "Stock" },
  { to: "/alerts", label: "Alerts" },
];

export function Layout() {
  const [alertCount, setAlertCount] = useState<number | null>(null);
  const location = useLocation();
  const { theme, toggle } = useTheme();

  const refreshAlertCount = useCallback(
    () =>
      fetch("/api/alerts?limit=1")
        .then((res) => res.json() as Promise<AlertsResponse>)
        .then((data) => setAlertCount(data.total))
        .catch(() => setAlertCount(null)),
    [],
  );

  // Refetch on navigation, and the moment any alert is raised or resolved anywhere.
  useEffect(() => {
    void refreshAlertCount();
  }, [location.pathname, refreshAlertCount]);
  useLiveRefresh(["alerts"], refreshAlertCount);

  const hasAlerts = alertCount !== null && alertCount > 0;

  return (
    <div className="min-h-screen">
      {/* Corner glows, fixed to the viewport: blue top-left, orange bottom-right. */}
      <div aria-hidden className="app-glow pointer-events-none fixed inset-0 -z-10" />

      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
              <Pill className="size-4.5" strokeWidth={2.25} />
            </span>
            <h1 className="hidden text-base font-medium tracking-tight sm:block">Pill Dispenser</h1>
          </div>

          <nav className="order-last flex w-full items-center gap-1 overflow-x-auto md:order-none md:ml-4 md:w-auto">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`
                }
              >
                {link.label}
                {link.to === "/alerts" && hasAlerts && (
                  <span
                    className="rounded-full bg-brand-orange-soft px-1.5 text-xs font-semibold text-brand-orange"
                    data-testid="alert-badge"
                  >
                    {alertCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <LiveIndicator />
            {hasAlerts && (
              <Link
                to="/alerts"
                className="hidden items-center gap-1.5 rounded-full bg-brand-orange px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:brightness-95 sm:flex"
              >
                Review {alertCount} {alertCount === 1 ? "alert" : "alerts"}
                <ChevronRight className="size-4" />
              </Link>
            )}
            <button
              type="button"
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Light theme" : "AMOLED dark theme"}
              className="flex size-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <AlertPopup onResolved={refreshAlertCount} />
      <VibrationToast />
    </div>
  );
}
