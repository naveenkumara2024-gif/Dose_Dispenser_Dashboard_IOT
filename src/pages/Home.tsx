import { useEffect, useState } from "react";
import { AlertBanner } from "@/components/AlertBanner";
import { DashboardStats } from "@/components/DashboardStats";
import { TodaySchedule } from "@/components/TodaySchedule";
import type { DashboardData } from "@/types";

export function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<DashboardData>;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Today</h2>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Could not load dashboard: {error}
        </div>
      )}

      {!data && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {data && (
        <>
          <AlertBanner
            alerts={data.activeAlerts}
            totalCount={data.activeAlertCount}
          />
          <DashboardStats
            adherence={data.adherence}
            device={data.device}
            dosesToday={data.todaysDoses.length}
            alertCount={data.activeAlertCount}
          />
          <TodaySchedule doses={data.todaysDoses} />
        </>
      )}
    </div>
  );
}
