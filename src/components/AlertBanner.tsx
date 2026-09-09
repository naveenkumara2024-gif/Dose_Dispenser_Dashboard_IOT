import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import type { ActiveAlert } from "@/types";

const ALERT_LABELS: Record<ActiveAlert["type"], string> = {
  LOW_STOCK: "Low stock",
  MISSED_DOSE: "Missed dose",
  STORAGE_CONDITION: "Storage condition",
  DEVICE_OFFLINE: "Device offline",
};

type Props = {
  alerts: ActiveAlert[];
  totalCount: number;
};

export function AlertBanner({ alerts, totalCount }: Props) {
  if (alerts.length === 0) return null;

  const hiddenCount = totalCount - alerts.length;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2 font-medium text-amber-900">
        <AlertTriangle className="h-5 w-5" />
        {totalCount} active {totalCount === 1 ? "alert" : "alerts"}
      </div>
      <ul className="mt-3 space-y-2">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex items-start gap-2 text-sm">
            <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
              {ALERT_LABELS[alert.type]}
            </span>
            <span className="text-amber-900">{alert.message}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/alerts"
        className="mt-3 inline-block text-sm font-medium text-amber-900 underline underline-offset-2"
      >
        {hiddenCount > 0 ? `View all ${totalCount} alerts` : "Manage alerts"}
      </Link>
    </div>
  );
}
