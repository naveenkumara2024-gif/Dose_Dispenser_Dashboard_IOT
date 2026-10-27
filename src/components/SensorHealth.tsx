import type { SensorInfo, SensorStatus } from "@/types";

// Status is a dot plus a word, never colour alone.
const STATUS: Record<SensorStatus, { label: string; dot: string; text: string }> = {
  ok: { label: "Working", dot: "bg-emerald-500", text: "text-muted-foreground" },
  warning: { label: "Attention", dot: "bg-brand-orange", text: "text-brand-orange" },
  stale: { label: "No recent data", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  offline: { label: "Device offline", dot: "bg-slate-400", text: "text-muted-foreground" },
  no_data: { label: "No data yet", dot: "bg-slate-400", text: "text-muted-foreground" },
};

export function formatAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SensorHealth({ sensors }: { sensors: SensorInfo[] }) {
  return (
    <ul className="flex flex-1 flex-col gap-1.5" data-testid="sensor-health">
      {sensors.map((s) => {
        const st = STATUS[s.status];
        return (
          <li
            key={s.key}
            data-testid={`sensor-${s.key}`}
            data-status={s.status}
            className="flex flex-1 items-center gap-3 rounded-2xl bg-muted/60 box-surface px-3.5 py-2.5"
          >
            <span className="relative flex size-2.5 shrink-0">
              {s.status === "ok" && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
              )}
              <span className={`relative inline-flex size-2.5 rounded-full ${st.dot}`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {s.part} · {s.status === "offline" ? "last reading " : ""}
                {formatAgo(s.lastSeenAt)}
              </p>
            </div>
            <p
              className={`max-w-[45%] shrink-0 truncate text-right text-sm tabular-nums ${st.text}`}
              title={s.lastValue ?? st.label}
            >
              {s.status === "ok" ? (s.lastValue ?? st.label) : st.label}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
