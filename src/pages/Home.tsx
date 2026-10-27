import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, Check } from "lucide-react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { CompartmentWheel, buildWheel } from "@/components/CompartmentWheel";
import { DeviceStatus } from "@/components/DeviceStatus";
import { PillStock } from "@/components/PillStock";
import { Gauge } from "@/components/Gauge";
import { Meter } from "@/components/Meter";
import { SensorHealth, formatAgo } from "@/components/SensorHealth";
import { Card } from "@/components/ui/card";
import { useLiveRefresh } from "@/lib/live";
import { STALE_AFTER_MS } from "@/lib/sensors";
import { ALERT_LABELS, type DashboardData, type SensorsResponse, type TodaysDose } from "@/types";

const MAX_ALERTS_SHOWN = 3;

function minutesOf(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

function countdown(diffMin: number): string {
  const m = Math.abs(Math.round(diffMin));
  const text = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
  return diffMin < 0 ? `${text} overdue` : `in ${text}`;
}

const timeOnly = (d: Date) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sensors, setSensors] = useState<SensorsResponse | null>(null);
  const fetchedAt = useRef(Date.now());
  const [, setTick] = useState(0);

  const load = useCallback(
    () =>
      fetch("/api/dashboard")
        .then((res) => {
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          return res.json() as Promise<DashboardData>;
        })
        .then((d) => {
          fetchedAt.current = Date.now();
          setData(d);
          setError(null);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useLiveRefresh(["dashboard"], load);

  // Only the latest reading and sensor health are shown, so ask for the shortest window.
  const loadSensors = useCallback(
    () =>
      fetch("/api/sensors?range=1h")
        .then((res) => (res.ok ? (res.json() as Promise<SensorsResponse>) : null))
        .then((d) => setSensors(d))
        .catch(() => setSensors(null)),
    [],
  );
  useEffect(() => {
    void loadSensors();
  }, [loadSensors]);
  useLiveRefresh(["sensors"], loadSensors);

  // Keeps the "next drop in ..." countdown and the "12s ago" texts moving.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const doses = data?.todaysDoses ?? [];
  const count = (status: TodaysDose["status"]) =>
    doses.filter((d) => d.status === status).length;
  const taken = count("CONFIRMED_TAKEN");
  const wheel = data ? buildWheel(data) : null;
  const next = wheel?.next ?? null;
  const nowMin = data
    ? data.nowMinutes + (Date.now() - fetchedAt.current) / 60_000
    : 0;

  const env = sensors?.environment;
  const alive = sensors?.sensors.filter((x) => x.status === "ok").length ?? 0;
  const aliveAll = sensors !== null && alive === sensors.sensors.length;
  const deviceOffline = sensors !== null && !sensors.device.online;
  // An old reading is shown muted: either the device is offline or the DHT11 went quiet.
  const envStale =
    deviceOffline ||
    (!!env?.latest && Date.now() - new Date(env.latest.timestamp).getTime() > STALE_AFTER_MS);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            {today}
            {data && (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${data.device.online ? "bg-emerald-500" : "bg-slate-400"}`}
                  />
                  Device {data.device.online ? "online" : "offline"}
                </span>
                {" · Updated "}
                {timeOnly(new Date(fetchedAt.current))}
              </>
            )}
          </p>
          <h2 className="mt-2 text-6xl font-light tracking-tight sm:text-7xl">Today</h2>
        </div>
        {data && (
          <div className="flex flex-wrap gap-x-10 gap-y-6">
            <Meter
              label="Doses taken today"
              value={`${taken}/${doses.length}`}
              pct={doses.length ? (taken / doses.length) * 100 : null}
              tone="blue"
              footLeft={{ value: count("PENDING"), label: "Still to drop" }}
              footRight={{
                value: doses.length ? `${Math.round((taken / doses.length) * 100)}%` : "—",
                label: "Complete",
              }}
            />
            <Meter
              label={`Adherence, ${data.adherence.windowDays} days`}
              value={data.adherence.pct === null ? "—" : `${data.adherence.pct}%`}
              pct={data.adherence.pct}
              tone="orange"
              footLeft={{ value: data.adherence.confirmed, label: "Confirmed" }}
              footRight={{ value: data.adherence.dispensed, label: "Dispensed" }}
            />
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-2xl bg-brand-orange-soft p-4 text-sm text-brand-orange">
          Could not load dashboard: {error}
        </div>
      )}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && wheel && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {/* Column 1: compartments + pill stock */}
          <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
          <Card className="gap-5 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Compartments</h3>
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                {wheel.slots.filter((s) => s.state !== "empty").length} of {wheel.slots.length} loaded
              </span>
            </div>

            <CompartmentWheel slots={wheel.slots}>
              {next ? (
                <>
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    Next drop
                  </span>
                  <span
                    className="text-4xl font-light tracking-tight tabular-nums sm:text-5xl"
                    data-testid="next-drop-time"
                  >
                    {next.time}
                  </span>
                  <span className="text-sm text-brand-orange">Compartment {next.compartmentNo}</span>
                </>
              ) : (
                <>
                  <span className="text-3xl font-light tracking-tight">
                    {doses.length ? "All done" : "No doses"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {doses.length ? "for today" : "scheduled today"}
                  </span>
                </>
              )}
            </CompartmentWheel>

            <div className="text-center" data-testid="next-drop-summary">
              {next ? (
                <>
                  <p className="font-medium">
                    {next.medicationName}{" "}
                    <span className="font-normal text-muted-foreground">{next.dosage}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Drops {countdown(minutesOf(next.time) - nowMin)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {doses.length ? "Nothing left to drop today." : "Add a dose on the Schedule page."}
                </p>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              <Tile
                label="Queued"
                value={wheel.slots.filter((s) => s.state === "queued" || s.state === "next").length}
              >
                <span className="size-2.5 shrink-0 rounded-full bg-brand-blue" />
              </Tile>
              <Tile label="Dispensed" value={count("DISPENSED")}>
                <span className="size-2.5 shrink-0 rounded-full bg-brand-blue-soft ring-1 ring-brand-blue/50" />
              </Tile>
              <Tile label="Taken" value={taken}>
                <span className="size-2.5 shrink-0 rounded-full bg-[repeating-linear-gradient(135deg,var(--hatch-line)_0_1px,var(--hatch-bg)_1px_3px)] ring-1 ring-foreground/20" />
              </Tile>
              <Tile label="Missed" value={count("MISSED")}>
                <span className="size-2.5 shrink-0 rounded-full bg-brand-orange" />
              </Tile>
            </div>
          </Card>
          {sensors && <PillStock loadCell={sensors.loadCell} online={sensors.device.online} />}
          {sensors && <DeviceStatus sensors={sensors} />}
          </div>

          {/* Column 2: schedule + alerts + what the dispenser did */}
          <div className="flex flex-col gap-4">
            <Card className="gap-4 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Today's schedule</h3>
                <Link to="/schedule" className="text-sm text-muted-foreground hover:text-foreground">
                  Edit schedule
                </Link>
              </div>
              {doses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No medications scheduled yet.</p>
              ) : (
                <ul className="space-y-2">
                  {doses.map((dose) => (
                    <li
                      key={dose.scheduleId}
                      className={`box-surface flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${
                        dose.scheduleId === next?.scheduleId ? "bg-brand-orange-soft" : "bg-muted/60"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="font-mono text-base tabular-nums">{dose.time}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{dose.medicationName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {dose.dosage} · Compartment {dose.compartmentNo}
                          </p>
                        </div>
                      </div>
                      <StatusChip dose={dose} isNext={dose.scheduleId === next?.scheduleId} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="gap-4 p-6">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-medium">
                  <AlertTriangle className="size-4.5 text-brand-orange" />
                  Alerts
                </h3>
                <Link
                  to="/alerts"
                  aria-label="Open alerts"
                  className="flex size-8 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground"
                >
                  <ArrowUpRight className="size-4" />
                </Link>
              </div>
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-light tracking-tight tabular-nums">
                  {data.activeAlertCount}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data.activeAlertCount === 0 ? "All clear" : "unresolved"}
                </p>
              </div>
              {data.activeAlerts.length > 0 && (
                <ul className="space-y-2">
                  {data.activeAlerts.slice(0, MAX_ALERTS_SHOWN).map((a) => (
                    <li key={a.id} className="rounded-2xl bg-muted/60 box-surface px-4 py-3">
                      <p className="text-sm font-medium">{ALERT_LABELS[a.type]}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{a.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {sensors && <ActivityFeed events={sensors.activity} />}
          </div>

          {/* Column 3: storage environment + sensor health */}
          <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
            <Card className="gap-4 p-6" data-testid="environment-card">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Storage</h3>
                <span className="text-xs text-muted-foreground">
                  {env?.latest
                    ? `${envStale ? "Last reading" : "Updated"} ${formatAgo(env.latest.timestamp)}`
                    : "No reading yet"}
                </span>
              </div>
              {env ? (
                <div className="grid grid-cols-2 gap-4">
                  <Gauge
                    label="Temperature"
                    value={env.latest?.temperature ?? null}
                    unit="°C"
                    digits={1}
                    min={0}
                    max={50}
                    safe={env.safeRange.temperature}
                    stale={envStale}
                  />
                  <Gauge
                    label="Humidity"
                    value={env.latest?.humidity ?? null}
                    unit="%"
                    min={0}
                    max={100}
                    safe={env.safeRange.humidity}
                    stale={envStale}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
            </Card>

            <Card className="flex-1 gap-4 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Sensors</h3>
                {sensors && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      deviceOffline
                        ? "bg-muted text-muted-foreground"
                        : aliveAll
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-brand-orange-soft text-brand-orange"
                    }`}
                    data-testid="sensors-alive"
                  >
                    {deviceOffline
                      ? sensors.device.lastSeenAt
                        ? "Device offline"
                        : "No device connected yet"
                      : `${alive} of ${sensors.sensors.length} alive`}
                  </span>
                )}
              </div>
              {sensors ? (
                <SensorHealth sensors={sensors.sensors} />
              ) : (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  children,
}: {
  label: string;
  value: number;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-muted/60 box-surface px-3 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {children}
        {label}
      </div>
      <p className="mt-2 text-2xl font-light tabular-nums">{value}</p>
    </div>
  );
}

function StatusChip({ dose, isNext }: { dose: TodaysDose; isNext: boolean }) {
  const base = "shrink-0 rounded-full px-3 py-1 text-xs font-medium";
  if (isNext) return <span className={`${base} bg-foreground text-background`}>Next</span>;
  switch (dose.status) {
    case "PENDING":
      return <span className={`${base} bg-card text-muted-foreground`}>Pending</span>;
    case "DISPENSED":
      return (
        <span className={`${base} bg-brand-blue-soft text-brand-blue`}>Awaiting confirmation</span>
      );
    case "CONFIRMED_TAKEN":
      return (
        <span className={`${base} inline-flex items-center gap-1 bg-card text-muted-foreground`}>
          <Check className="size-3" /> Taken
        </span>
      );
    case "MISSED":
      return <span className={`${base} bg-brand-orange text-white`}>Missed</span>;
  }
}
