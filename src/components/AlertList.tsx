import { Button } from "@/components/ui/button";
import { ALERT_LABELS, type AlertRow } from "@/types";

const TYPE_STYLES: Record<AlertRow["type"], string> = {
  LOW_STOCK: "bg-amber-100 text-amber-900",
  MISSED_DOSE: "bg-red-100 text-red-800",
  STORAGE_CONDITION: "bg-orange-100 text-orange-900",
  DEVICE_OFFLINE: "bg-slate-200 text-slate-800",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

type Props = {
  alerts: AlertRow[];
  busyId: string | null;
  onToggle: (alert: AlertRow) => void;
};

export function AlertList({ alerts, busyId, onToggle }: Props) {
  if (alerts.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Nothing here — no alerts match these filters.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[alert.type]}`}
            >
              {ALERT_LABELS[alert.type]}
            </span>
            <div className="min-w-0">
              <p className={alert.resolved ? "text-muted-foreground" : ""}>
                {alert.message}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatWhen(alert.createdAt)}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busyId === alert.id}
            onClick={() => onToggle(alert)}
          >
            {alert.resolved ? "Reopen" : "Resolve"}
          </Button>
        </li>
      ))}
    </ul>
  );
}
