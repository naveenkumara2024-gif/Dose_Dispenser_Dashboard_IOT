import { AlertTriangle, Vibrate } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLiveAlerts, useLiveRefresh, useLiveState } from "@/lib/live";
import { ALERT_LABELS, type AlertRow, type AlertsResponse } from "@/types";

// Only conditions that need someone to physically check the device pop up; missed
// doses and low stock stay in the banner + Alerts page so the modal isn't noise.
const POPUP_TYPES: AlertRow["type"][] = ["DEVICE_TILTED", "STORAGE_CONDITION"];

type Props = {
  /** Called after an alert is resolved here, so the nav badge can refresh. */
  onResolved: () => void;
};

export function AlertPopup({ onResolved }: Props) {
  const [queue, setQueue] = useState<AlertRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ids already shown in this tab, so a dismissed alert doesn't reopen on the next refresh.
  const seen = useRef(new Set<string>());
  const ackButton = useRef<HTMLButtonElement>(null);

  const enqueue = useCallback((alerts: AlertRow[]) => {
    const fresh = alerts.filter(
      (a) => POPUP_TYPES.includes(a.type) && !a.resolved && !seen.current.has(a.id),
    );
    if (fresh.length === 0) return;
    for (const a of fresh) seen.current.add(a.id);
    setQueue((q) => [...q, ...fresh]);
  }, []);

  // Alerts already open when the page loads, plus a safety net after reconnects and
  // during the polling fallback (prompt 22).
  const poll = useCallback(
    () =>
      fetch("/api/alerts?limit=20")
        .then((res) => (res.ok ? (res.json() as Promise<AlertsResponse>) : null))
        .then((data) => data && enqueue(data.alerts))
        .catch(() => {
          // Best-effort; the Alerts page remains the source of truth.
        }),
    [enqueue],
  );

  useEffect(() => {
    void poll();
  }, [poll]);
  useLiveRefresh(["alerts"], poll);
  // The pushed alert row opens the pop-up immediately, without a refetch.
  useLiveAlerts((alert) => enqueue([alert]));

  const current = queue[0];

  useEffect(() => {
    if (current) ackButton.current?.focus();
  }, [current]);

  if (!current) return null;

  const next = () => {
    setError(null);
    setQueue((q) => q.slice(1));
  };

  const acknowledge = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/alerts/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      onResolved();
      next();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-popup-title"
        aria-describedby="alert-popup-message"
        className="w-full max-w-md overflow-hidden rounded-xl bg-card text-card-foreground shadow-xl"
        data-testid="alert-popup"
      >
        <div className="flex items-center gap-2 bg-red-600 px-5 py-3 text-white">
          <AlertTriangle className="size-5" />
          <h2 id="alert-popup-title" className="font-semibold">
            {ALERT_LABELS[current.type]}
          </h2>
          {queue.length > 1 && (
            <span className="ml-auto text-xs opacity-90">+{queue.length - 1} more</span>
          )}
        </div>
        <div className="space-y-2 px-5 py-4">
          <p id="alert-popup-message" className="text-sm">
            {current.message}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(current.createdAt).toLocaleString()}
          </p>
          {error && <p className="text-xs text-red-700 dark:text-red-300">Could not resolve: {error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={next} disabled={busy}>
            Dismiss
          </Button>
          <Button ref={ackButton} onClick={acknowledge} disabled={busy}>
            {busy ? "Resolving…" : "Acknowledge"}
          </Button>
        </div>
      </div>
    </div>
  );
}


// Heavy shaking is momentary, so it isn't an alert to resolve; this toast shows it on any
// page the moment the device reports it, then goes away by itself.
const TOAST_SHOW_MS = 6_000;
// Ignore an old shake replayed in the connection hello when a page opens.
const TOAST_FRESH_MS = 10_000;

export function VibrationToast() {
  const { vibration } = useLiveState();
  const [visibleAt, setVisibleAt] = useState<string | null>(null);

  useEffect(() => {
    if (!vibration || vibration.type !== "SHAKE") return;
    if (Date.now() - new Date(vibration.at).getTime() > TOAST_FRESH_MS) return;
    setVisibleAt(vibration.at);
    const timer = setTimeout(() => setVisibleAt(null), TOAST_SHOW_MS);
    return () => clearTimeout(timer);
  }, [vibration]);

  if (!visibleAt) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      data-testid="vibration-toast"
      className="fixed right-4 bottom-4 left-4 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 px-4 py-3 shadow-lg sm:left-auto"
    >
      <Vibrate className="size-5 shrink-0 text-red-700 dark:text-red-300" />
      <div className="min-w-0">
        <p className="font-semibold text-red-800 dark:text-red-300">Heavy shaking detected</p>
        <p className="text-xs text-red-800/80 dark:text-red-300/80">
          {new Date(visibleAt).toLocaleTimeString()} · the dispenser is being shaken or knocked
        </p>
      </div>
      <button
        type="button"
        onClick={() => setVisibleAt(null)}
        className="ml-auto text-xs font-medium text-red-800 dark:text-red-300 underline"
      >
        Dismiss
      </button>
    </div>
  );
}
