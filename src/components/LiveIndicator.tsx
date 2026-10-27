import { useLiveState, type LiveStatus } from "@/lib/live";

// Connection state of the real-time channel (prompt 22). Label + dot, never color alone.
const STATUS: Record<LiveStatus, { label: string; dot: string; title: string }> = {
  connecting: {
    label: "Connecting…",
    dot: "bg-slate-400",
    title: "Opening the live connection",
  },
  live: {
    label: "Live",
    dot: "bg-green-600",
    title: "Updates appear the moment they happen",
  },
  reconnecting: {
    label: "Reconnecting…",
    dot: "bg-amber-500",
    title: "Live connection dropped; retrying",
  },
  offline: {
    label: "Offline · refreshing every 30 s",
    dot: "bg-slate-400",
    title: "Server unreachable; pages refresh every 30 s until it's back",
  },
};

export function LiveIndicator() {
  const { status } = useLiveState();
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={s.title}
      data-testid="live-indicator"
      data-status={status}
      aria-live="polite"
    >
      <span className={`size-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
