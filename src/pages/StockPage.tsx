import { useCallback, useEffect, useState } from "react";
import { StockChart } from "@/components/StockChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveRefresh } from "@/lib/live";
import type { StockRow } from "@/types";

function formatLastUpdated(iso: string | null): string {
  if (!iso) return "No reading yet";
  return `Updated ${new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

// The device has one load cell (prompt 18). /api/stock is still grouped by the
// compartmentNo the firmware posts with, so collapse it: the newest reading is the
// current weight, and every row's history merges into one trend.
const HISTORY_POINTS = 30;

function collapse(rows: StockRow[]) {
  const withReading = rows.filter((r) => r.lastUpdated !== null);
  const latest = withReading.sort((a, b) => b.lastUpdated!.localeCompare(a.lastUpdated!))[0];
  const history = rows
    .flatMap((r) => r.history)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-HISTORY_POINTS);
  return latest ? { ...latest, history } : null;
}

export function StockPage() {
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/stock")
        .then((res) => {
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          return res.json() as Promise<StockRow[]>;
        })
        .then((r) => {
          setRows(r);
          setError(null);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useLiveRefresh(["stock"], load);

  const cell = rows ? collapse(rows) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Stock</h2>
        <p className="text-sm text-muted-foreground">
          Total pill weight from the load cell and how it's trending.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-300">
          Could not load stock: {error}
        </div>
      )}

      {!rows && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {rows && !cell && (
        <p className="text-sm text-muted-foreground">
          No load-cell readings yet.
        </p>
      )}

      {cell && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Pill weight (load cell)</CardTitle>
              {cell.lowStock && (
                <span className="rounded-full bg-amber-100 dark:bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-900 dark:text-amber-300">
                  Low stock
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{cell.weight}g</span>
              {cell.percent !== null && (
                <span className="text-sm font-medium">{Math.round(cell.percent)}% full</span>
              )}
              <span className="text-xs text-muted-foreground">
                {formatLastUpdated(cell.lastUpdated)}
              </span>
            </div>
            <StockChart history={cell.history} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
