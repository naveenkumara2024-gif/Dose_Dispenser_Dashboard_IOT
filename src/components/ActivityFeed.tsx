import {
  AlertTriangle,
  Ban,
  Bell,
  Pill,
  RotateCw,
  UserCheck,
  UserX,
  Vibrate,
} from "lucide-react";
import type { ComponentType } from "react";
import { formatAgo } from "@/components/SensorHealth";
import { Card } from "@/components/ui/card";
import type { DeviceEvent, DeviceEventType } from "@/types";

type Meta = {
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /** Something that needs a caregiver's attention. */
  problem?: boolean;
};

const EVENTS: Record<DeviceEventType, Meta> = {
  PRESENCE_DETECTED: { label: "Patient detected", Icon: UserCheck },
  NO_PRESENCE: { label: "Nobody came", Icon: UserX, problem: true },
  REMINDER: { label: "Reminder sounded", Icon: Bell },
  SERVO_ROTATED: { label: "Wheel turned", Icon: RotateCw },
  PILL_DROP: { label: "Pill dropped", Icon: Pill },
  NO_DROP: { label: "No pill dropped", Icon: Ban, problem: true },
  KNOCK: { label: "Knock", Icon: Vibrate },
  SHAKE: { label: "Heavy shaking", Icon: AlertTriangle, problem: true },
};

/**
 * The dose cycle as the dispenser reported it, newest first - the story behind a missed dose.
 * Rows keep a fixed compact height; the list fills whatever height the column has and scrolls
 * inside the card, so the card never adds blank space or makes the column taller.
 */
export function ActivityFeed({ events }: { events: DeviceEvent[] }) {
  const rows = events;

  return (
    <Card className="flex-1 gap-3 p-6 pb-3" data-testid="activity-feed">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Recent activity</h3>
        <span className="text-xs text-muted-foreground">From the dispenser</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Bell className="size-5" />
          </span>
          <p className="max-w-xs text-sm text-muted-foreground">
            No activity yet. Events appear here as the dispenser detects the patient, sounds the
            reminder, turns the wheel and drops a pill.
          </p>
        </div>
      ) : (
        <div className="relative min-h-64 flex-1">
        <ul className="absolute inset-0 divide-y divide-border/70 overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)] [scrollbar-width:thin]">
          {rows.map((e) => {
            const meta = EVENTS[e.type];
            return (
              <li key={e.id} className="flex items-center gap-3 py-2.5 first:pt-1">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                    meta.problem ? "bg-brand-orange-soft text-brand-orange" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <meta.Icon className="size-4" />
                </span>
                <p className={`min-w-0 flex-1 truncate text-sm ${meta.problem ? "font-medium" : ""}`}>
                  {meta.label}
                  {e.detail && <span className="text-muted-foreground"> · {e.detail}</span>}
                </p>
                <time
                  dateTime={e.timestamp}
                  title={new Date(e.timestamp).toLocaleString()}
                  className="shrink-0 text-xs tabular-nums text-muted-foreground"
                >
                  {formatAgo(e.timestamp)}
                </time>
              </li>
            );
          })}
        </ul>
        </div>
      )}
    </Card>
  );
}
