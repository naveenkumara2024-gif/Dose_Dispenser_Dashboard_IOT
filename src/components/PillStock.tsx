import { Link } from "react-router-dom";
import { formatAgo } from "@/components/SensorHealth";
import { Card } from "@/components/ui/card";
import { LOW_STOCK_PCT, LOW_STOCK_THRESHOLD_G } from "@/lib/sensors";
import type { SensorsResponse } from "@/types";

/** How much medication is left on the wheel, and whether it's time to refill (load cell). */
export function PillStock({
  loadCell,
  online,
}: {
  loadCell: SensorsResponse["loadCell"];
  /** Offline: the reading is the last one the device sent, so an "OK" is not asserted as current. */
  online: boolean;
}) {
  const pct = loadCell?.percent ?? null;
  const low = !!loadCell?.lowStock;

  return (
    <Card className="gap-4 p-6" data-testid="pill-stock">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Pill stock</h3>
        {loadCell ? (
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              low
                ? "bg-brand-orange-soft text-brand-orange"
                : online
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {low ? "Low · refill soon" : online ? "Stock OK" : "Last known · OK"}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            No reading
          </span>
        )}
      </div>

      {loadCell ? (
        <>
          <div className="flex items-end justify-between gap-4">
            <p className="text-5xl font-light tracking-tight tabular-nums">
              {pct !== null ? `${Math.round(pct)}%` : `${loadCell.weight} g`}
              <span className="ml-2 text-sm font-normal tracking-normal text-muted-foreground">
                {pct !== null ? "of a full wheel" : "on the wheel"}
              </span>
            </p>
            <Link
              to="/stock"
              className="shrink-0 pb-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Trend
            </Link>
          </div>

          {pct !== null && (
            <div>
              <div
                className="relative h-3 rounded-full bg-muted"
                role="progressbar"
                aria-label="Pill stock"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${Math.max(0, Math.min(100, pct))}%`,
                    backgroundImage: `linear-gradient(90deg, var(${low ? "--brand-orange" : "--brand-blue"}), var(${low ? "--brand-orange-soft" : "--brand-blue-soft"}))`,
                  }}
                />
                <span
                  aria-hidden
                  className="absolute -top-1 h-5 w-0.5 rounded bg-foreground/60"
                  style={{ left: `${LOW_STOCK_PCT}%` }}
                />
              </div>
              <div className="relative mt-1 h-4 text-[11px] text-muted-foreground">
                <span className="absolute -translate-x-1/2" style={{ left: `${LOW_STOCK_PCT}%` }}>
                  Refill at {LOW_STOCK_PCT}%
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {pct !== null
              ? `${loadCell.weight} g · `
              : `Refill below ${LOW_STOCK_THRESHOLD_G} g · `}
            updated {formatAgo(loadCell.lastUpdated)}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No weight reading from the load cell yet.
        </p>
      )}
    </Card>
  );
}
