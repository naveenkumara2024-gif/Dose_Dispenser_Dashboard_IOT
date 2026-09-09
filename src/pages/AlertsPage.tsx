import { useCallback, useEffect, useState } from "react";
import { AlertList } from "@/components/AlertList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ALERT_LABELS, type AlertRow, type AlertsResponse } from "@/types";

const PAGE_SIZE = 25;

export function AlertsPage() {
  const [type, setType] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      resolved: String(showResolved),
    });
    if (type) query.set("type", type);

    const res = await fetch(`/api/alerts?${query}`);
    if (!res.ok) {
      setError("Could not load alerts.");
      return;
    }
    setError(null);
    setData((await res.json()) as AlertsResponse);
  }, [type, showResolved, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (alert: AlertRow) => {
    setBusyId(alert.id);
    try {
      const res = await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !alert.resolved }),
      });
      if (!res.ok) {
        setError("Could not update that alert.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const total = data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Alerts</h2>
        <p className="text-sm text-muted-foreground">
          Missed doses, low stock, storage conditions, and device status.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-48">
              <Label htmlFor="filter-type">Type</Label>
              <select
                id="filter-type"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">All types</option>
                {Object.entries(ALERT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                id="show-resolved"
                type="checkbox"
                checked={showResolved}
                onChange={(e) => {
                  setShowResolved(e.target.checked);
                  setOffset(0);
                }}
              />
              Show resolved
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {showResolved ? "Resolved alerts" : "Active alerts"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <AlertList
                alerts={data.alerts}
                busyId={busyId}
                onToggle={toggle}
              />
              <div className="mt-4 flex items-center justify-between">
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="alerts-range"
                >
                  {total === 0
                    ? "No results"
                    : `${showingFrom}–${showingTo} of ${total}`}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={showingTo >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
