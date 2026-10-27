import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AlertRow } from "@/types";
import type { InvalidateKey, LiveTelemetry, ToDashboard, Vibration } from "../ws/protocol";

// Real-time layer for the dashboard (prompt 22): one WebSocket per tab, shared by every
// page. The server says *what* changed ("invalidate") and each page refetches its own
// endpoint, so page data keeps a single shape and source. While the socket is down,
// pages fall back to polling.

export type LiveStatus = "connecting" | "live" | "reconnecting" | "offline";
export type LiveSnapshot = LiveTelemetry & { at: string };
export type { Vibration };

type Listener = { keys: ReadonlySet<InvalidateKey>; refresh: () => void };

// Stable functions only, so subscribing never re-runs when telemetry ticks.
type LiveBus = {
  subscribe: (listener: Listener) => () => void;
  onAlert: (callback: (alert: AlertRow) => void) => () => void;
};

type LiveState = {
  status: LiveStatus;
  telemetry: LiveSnapshot | null;
  deviceOnline: boolean | null;
  /** Last knock / heavy shaking the device reported (pushed the moment it happens). */
  vibration: Vibration | null;
};

const BusContext = createContext<LiveBus | null>(null);
const StateContext = createContext<LiveState>({
  status: "connecting",
  telemetry: null,
  deviceOnline: null,
  vibration: null,
});

const FALLBACK_POLL_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
// After this many failed reconnects, say "offline" rather than "reconnecting".
const OFFLINE_AFTER_ATTEMPTS = 3;

export function LiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LiveState>({
    status: "connecting",
    telemetry: null,
    deviceOnline: null,
    vibration: null,
  });
  const listeners = useRef(new Set<Listener>());
  const alertListeners = useRef(new Set<(alert: AlertRow) => void>());

  const refresh = useCallback((keys?: InvalidateKey[]) => {
    for (const listener of listeners.current) {
      if (!keys || keys.some((key) => listener.keys.has(key))) listener.refresh();
    }
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let everConnected = false;
    let stopped = false;

    const handle = (message: ToDashboard) => {
      switch (message.t) {
        case "hello":
          setState((s) => ({
            ...s,
            deviceOnline: message.device.online,
            telemetry: message.live,
            vibration: message.vibration ?? null,
          }));
          return;
        case "vibration":
          setState((s) => ({ ...s, vibration: message.vibration }));
          return;
        case "invalidate":
          refresh(message.keys);
          return;
        case "alert":
          for (const callback of alertListeners.current) callback(message.alert as AlertRow);
          return;
        case "live":
          setState((s) => ({ ...s, telemetry: message.live }));
          return;
        case "device":
          setState((s) => ({ ...s, deviceOnline: message.online }));
          return;
      }
    };

    const connect = () => {
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${scheme}://${location.host}/ws?role=dashboard`);
      socket = ws;

      ws.onopen = () => {
        attempts = 0;
        setState((s) => ({ ...s, status: "live" }));
        // Anything may have changed while we were disconnected.
        if (everConnected) refresh();
        everConnected = true;
      };
      ws.onmessage = (event) => {
        try {
          handle(JSON.parse(String(event.data)) as ToDashboard);
        } catch {
          // Ignore a malformed frame rather than drop the connection.
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        attempts += 1;
        setState((s) => ({
          ...s,
          status: attempts >= OFFLINE_AFTER_ATTEMPTS ? "offline" : "reconnecting",
        }));
        // Exponential backoff with jitter: 1 s, 2 s, 4 s … capped at 30 s.
        const delay = Math.min(1000 * 2 ** (attempts - 1), MAX_BACKOFF_MS);
        retryTimer = setTimeout(connect, delay * (0.8 + Math.random() * 0.4));
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [refresh]);

  // Polling fallback while the socket is down, so pages never silently go stale.
  useEffect(() => {
    if (state.status === "live" || state.status === "connecting") return;
    const timer = setInterval(() => refresh(), FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [state.status, refresh]);

  const bus = useMemo<LiveBus>(
    () => ({
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      onAlert: (callback) => {
        alertListeners.current.add(callback);
        return () => alertListeners.current.delete(callback);
      },
    }),
    [],
  );

  return (
    <BusContext.Provider value={bus}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </BusContext.Provider>
  );
}

/**
 * Re-runs `refresh` whenever the server says one of `keys` changed (or the socket
 * reconnects, or the fallback poll fires). Refreshes never overlap: a change that
 * arrives mid-fetch triggers exactly one more fetch afterwards, so the page always
 * ends on the newest data.
 */
export function useLiveRefresh(keys: InvalidateKey[], refresh: () => unknown) {
  const bus = useContext(BusContext);
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });

  const keyList = keys.join(",");
  useEffect(() => {
    if (!bus) return;
    let running = false;
    let dirty = false;
    const run = async () => {
      if (running) {
        dirty = true;
        return;
      }
      running = true;
      try {
        do {
          dirty = false;
          await latest.current();
        } while (dirty);
      } catch {
        // The page shows its own error state; a failed refresh must not stop future ones.
      } finally {
        running = false;
      }
    };
    return bus.subscribe({
      keys: new Set(keyList.split(",") as InvalidateKey[]),
      refresh: () => void run(),
    });
  }, [bus, keyList]);
}

/** Called with each newly raised alert the moment the server creates it. */
export function useLiveAlerts(callback: (alert: AlertRow) => void) {
  const bus = useContext(BusContext);
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => bus?.onAlert((alert) => latest.current(alert)), [bus]);
}

export function useLiveState(): LiveState {
  return useContext(StateContext);
}
