import { useCallback, useEffect, useState } from "react";
import { DoseHistoryTable } from "@/components/DoseHistoryTable";
import { HistoryFilters } from "@/components/HistoryFilters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveRefresh } from "@/lib/live";
import type {
  HistoryFilterState,
  HistoryResponse,
  ScheduleWithMedication,
} from "@/types";

const PAGE_SIZE = 25;

const EMPTY_FILTERS: HistoryFilterState = {
  status: "",
  medicationId: "",
  from: "",
  to: "",
};

export function HistoryPage() {
  const [filters, setFilters] = useState<HistoryFilterState>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [schedules, setSchedules] = useState<ScheduleWithMedication[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadSchedules = useCallback(
    () =>
      fetch("/api/schedule?includeArchived=1")
        .then((res) => res.json() as Promise<ScheduleWithMedication[]>)
        .then(setSchedules)
        .catch(() => setSchedules([])),
    [],
  );

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);
  // Medication filter options follow schedule edits made anywhere.
  useLiveRefresh(["schedule"], loadSchedules);

  const load = useCallback(async () => {
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (filters.status) query.set("status", filters.status);
    if (filters.medicationId) query.set("medicationId", filters.medicationId);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);

    const res = await fetch(`/api/history?${query}`);
    if (!res.ok) {
      setError("Could not load history.");
      return;
    }
    setError(null);
    setData((await res.json()) as HistoryResponse);
  }, [filters, offset]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveRefresh(["history"], load);

  const applyFilters = (next: HistoryFilterState) => {
    setFilters(next);
    setOffset(0);
  };

  const total = data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">History</h2>
        <p className="text-sm text-muted-foreground">
          Every dispense, confirmation, and missed dose.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <HistoryFilters
            value={filters}
            schedules={schedules}
            onChange={applyFilters}
            onClear={() => applyFilters(EMPTY_FILTERS)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dose events</CardTitle>
        </CardHeader>
        <CardContent>
          {data === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <DoseHistoryTable logs={data.logs} />
              <div className="mt-4 flex items-center justify-between">
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="history-range"
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
