import type { ReactNode } from "react";
import { formatAgo } from "@/components/SensorHealth";
import { Card } from "@/components/ui/card";
import type { SensorsResponse } from "@/types";

// RSSI -> a word a caregiver understands (ESP32 WiFi, in dBm).
function signal(rssi: number): { label: string; bars: number } {
  if (rssi >= -55) return { label: "Excellent", bars: 4 };
  if (rssi >= -67) return { label: "Good", bars: 3 };
  if (rssi >= -75) return { label: "Fair", bars: 2 };
  return { label: "Weak", bars: 1 };
}

function Bars({ active, dim }: { active: number; dim: boolean }) {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {[6, 9, 12, 16].map((h, i) => (
        <span
          key={h}
          className={`w-1 rounded-sm ${i < active ? (dim ? "bg-muted-foreground/60" : "bg-brand-blue") : "bg-muted-foreground/20"}`}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

function Row({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <li className="flex flex-1 items-center justify-between gap-3 rounded-2xl bg-muted/60 box-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-sm">{children}</div>
    </li>
  );
}

/** Is the dispenser connected, how strong is its WiFi, and is its clock right (doses run on it). */
export function DeviceStatus({ sensors }: { sensors: SensorsResponse }) {
  const { online, lastSeenAt, rssi } = sensors.device;
  const clock = sensors.sensors.find((s) => s.key === "rtc");
  const sig = rssi !== null ? signal(rssi) : null;
  const clockBad = clock?.status === "warning";

  return (
    <Card className="flex-1 gap-4 p-6" data-testid="device-status">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Device</h3>
        <span className="text-xs text-muted-foreground">
          {lastSeenAt ? `Heartbeat ${formatAgo(lastSeenAt)}` : "No heartbeat yet"}
        </span>
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        <Row
          title="Connection"
          sub={online ? "Reporting normally" : "Offline after 5 min of silence"}
        >
          <span
            className={`size-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-slate-400"}`}
          />
          <span className={online ? "" : "text-muted-foreground"}>
            {online ? "Online" : "Offline"}
          </span>
        </Row>
        <Row
          title="WiFi signal"
          sub={rssi !== null ? `${online ? "" : "Last known · "}${rssi} dBm` : "Not reported yet"}
        >
          <Bars active={sig?.bars ?? 0} dim={!online} />
          <span className={online ? "" : "text-muted-foreground"}>{sig?.label ?? "—"}</span>
        </Row>
        <Row
          title="Clock"
          sub={
            !online && clock?.lastValue
              ? `Last reading ${formatAgo(clock.lastSeenAt)}`
              : "Dose times depend on it"
          }
        >
          <span
            className={
              clockBad
                ? "font-medium text-brand-orange"
                : clock?.lastValue && online
                  ? ""
                  : "text-muted-foreground"
            }
          >
            {clock?.lastValue ?? "No reading"}
          </span>
        </Row>
      </ul>
    </Card>
  );
}
