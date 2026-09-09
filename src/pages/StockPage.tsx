import { useEffect, useState } from "react";
import { StockChart } from "@/components/StockChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function StockPage() {
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stock")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<StockRow[]>;
      })
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Stock</h2>
        <p className="text-sm text-muted-foreground">
          Weight per compartment and how it's trending.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Could not load stock: {error}
        </div>
      )}

      {!rows && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {rows && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No compartments reporting yet.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.compartmentNo}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Compartment {row.compartmentNo}
                  </CardTitle>
                  {row.lowStock && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                      Low stock
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.medicationName ?? "Unassigned"}
                </p>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold">
                    {row.weight === null ? "—" : `${row.weight}g`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatLastUpdated(row.lastUpdated)}
                  </span>
                </div>
                <StockChart history={row.history} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
