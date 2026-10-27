# 16 — Sensors & Environment Page

## Goal
A "Sensors" page that shows live status, last reading and history for **every sensor on the
device**, plus a pop-up alert (modal, any page) when the tilt sensor fires or storage goes out of range.

## Sensors covered
| Sensor | Data source | Exists today? |
|---|---|---|
| DHT11 (temperature, humidity) | `EnvironmentLog` via `POST /api/environment-log` | ✅ |
| Tilt sensor (SW-520D) | **new** `TiltLog` via **new** `POST /api/tilt-event` | ❌ add |
| IR break-beam (dispense detect) | `DispenseLog` status `DISPENSED` | ✅ |
| Push button (patient confirm) | `DispenseLog` status `CONFIRMED_TAKEN` | ✅ |
| Load cell / HX711 (stock weight) | `StockLevel` per compartment | ✅ |
| ESP32 WiFi link | `Device.lastSeenAt` (heartbeat) | ✅ |

## ⚠ Firmware contract change (additive, flagged per Section 7)
- New endpoint **`POST /api/tilt-event`**, body `{ "tilted": boolean }`. Firmware must send it
  on tilt state change (tilted → `true`, back upright → `false`). No existing endpoint renamed or reshaped.
- `tilted: true` raises a new `DEVICE_TILTED` alert (dedupe key `DEVICE_TILTED`);
  `tilted: false` auto-resolves it (same pattern as heartbeat → `DEVICE_OFFLINE`).

## Files to create/modify
- `src/db/schema.ts` — `TiltLog` table; add `DEVICE_TILTED` to `AlertType` enum
- `drizzle/` — new migration (`db:generate`)
- `src/lib/sensors.ts` (new) — shared safe-range constants (moved out of `environmentLog.ts`) + "stale reading" window
- `src/api/environmentLog.ts` — import constants from `lib/sensors.ts` (behavior unchanged)
- `src/api/tiltEvent.ts` (new) — `POST /api/tilt-event`
- `src/api/sensors.ts` (new) — `GET /api/sensors` (dashboard-only aggregate)
- `src/index.ts` — register both routes, wrapped in `withErrorHandling`
- `src/lib/validators.ts` — `tiltEventSchema`, `sensorsQuerySchema` (`range`: `1h|24h|7d`, default `24h`)
- `src/types/index.ts` — `SensorsResponse` types
- `src/components/SensorCard.tsx` (new) — one card per sensor: name, status pill, last value, "last seen x min ago"
- `src/components/EnvironmentChart.tsx` (new) — Recharts temp + humidity lines with shaded safe band, out-of-range points in red
- `src/components/AlertPopup.tsx` (new) — modal pop-up, mounted in `Layout`
- `src/pages/SensorsPage.tsx` (new)
- `src/components/Layout.tsx` / `src/App.tsx` — "Sensors" nav link + route, mount `AlertPopup`
- `src/pages/AlertsPage.tsx` / alert type label map — show `DEVICE_TILTED` nicely
- `claude.md` — Sections 6, 7, 10 updated

## Plan
1. Schema: `TiltLog { id uuid PK, tilted boolean, timestamp timestamptz default now() }`;
   `ALTER TYPE "AlertType" ADD VALUE 'DEVICE_TILTED'`. Generate + migrate.
2. `POST /api/tilt-event`: Zod-validate, insert `TiltLog`, raise or resolve `DEVICE_TILTED`. Returns 201 `{ tiltLog, alert }`.
3. `GET /api/sensors?range=24h` returns one object:
   - `sensors[]` — `{ key, name, part, status: "ok" | "warning" | "stale" | "no_data", lastValue, lastSeenAt }`
     for each row in the table above. `stale` = no reading in 15 min (device-offline-ish), `warning` = out of range / tilted / low stock.
   - `environment` — `{ readings: [{temperature, humidity, alert, timestamp}], min/max/avg temp + humidity, outOfRangeCount, safeRange }` for the range (capped at 500 points).
   - `tiltEvents` — last 20 `TiltLog` rows.
   - `stock` — latest weight per compartment (reuses existing query shape).
4. Sensors page layout (Tailwind, responsive grid):
   - Top: summary strip — "N of 6 sensors healthy", device online/offline, last update.
   - Sensor card grid (6 cards, 3-col desktop / 1-col phone), status colors green / amber / grey.
   - Environment section: range toggle (1h / 24h / 7d), temp + humidity chart with safe band,
     min/avg/max tiles, table of the last 20 readings with out-of-range rows highlighted.
   - Tilt section: current state (Upright / Tilted) + recent events timeline.
   - Auto-refresh every 10 s (`setInterval` in `useEffect`, cleared on unmount); loading + empty states.
5. `AlertPopup`: polls `GET /api/alerts?limit=5` every 10 s; when an unresolved
   `DEVICE_TILTED` or `STORAGE_CONDITION` alert appears that this browser tab hasn't shown yet,
   opens a modal (red header, message, time) with **"Acknowledge"** (→ `PATCH /api/alerts/:id {resolved:true}`)
   and **"Dismiss"** (close, stays unresolved). Shown alert ids kept in component state.
6. Update `claude.md` (schema, firmware table, prompt log).

## Assumptions (please confirm / correct)
- **Hardware list is the 6 rows above.** If the device has others (e.g. RTC DS3231, buzzer,
  servo/stepper, LDR, PIR), tell me which and how the ESP32 reports them — I won't invent endpoints for sensors I can't confirm.
- Tilt is a digital on/off sensor and firmware can POST on state change.
- Safe ranges stay the current placeholders: 15–30 °C, 30–60 % RH.
- Pop-up only for tilt + storage alerts (missed dose / low stock stay in the banner + Alerts page, to avoid pop-up spam).
- Polling (10 s) rather than WebSockets — good enough for a review demo, no new infra.
- No auth (still deferred).
- Prompt 14 is still awaiting approval; this is independent of it.

## Verification
1. `bun run db:generate && bun run db:migrate`; `db:studio` shows `TiltLog` and `DEVICE_TILTED` in the enum.
2. `curl -X POST localhost:3000/api/tilt-event -d '{"tilted":true}'` → 201, an unresolved `DEVICE_TILTED` alert exists;
   `{"tilted":false}` → that alert resolved. `{"tilted":"x"}` → 400 JSON.
3. POST ~10 environment readings (some out of range); `GET /api/sensors?range=1h` → counts/min/max match what was posted.
4. Open `/sensors` in a browser: 6 cards render with the right status; chart shows the safe band and red out-of-range points; phone-width has no horizontal scroll.
5. With the page open on any route, POST `tilted:true` → pop-up appears within ~10 s; "Acknowledge" resolves it (Alerts page confirms).
6. Empty DB → page shows "No data yet" states, no crashes. `bunx tsc --noEmit` clean.

## Verification results
- Migration `0007_neat_warbird.sql` applied (TiltLog + `DEVICE_TILTED`).
- `tilt-event`: bad body → 400; `true` → 201 + alert; repeat `true` → deduped (`alert: null`); `false` → alert resolved.
- `sensors?range=2y` → 400. Posted 10 DHT11 readings (3 out of range) → `range=1h` stats exactly count 10, outOfRange 3, avg 23.9 °C.
- Headless Chrome on `/sensors`: 6 cards, 2 charts with safe band + red out-of-range dots; storage and tilt
  pop-ups both appeared on load, "Acknowledge" resolved them via API; no console errors; 390px width has no page overflow.
- `tsc --noEmit` clean (TypeScript 5.9 — `bunx tsc` latest is a broken tsgo build).
- Deviations: nav switched to `flex-wrap` (6 links; `overflow-x-auto` produced a stray scrollbar). Pop-up is mounted in `Layout`
  and refreshes the nav alert badge on acknowledge.

✅ Completed — Sensors page for all six sensors, tilt endpoint + alert, DHT11 charts/table, global tilt/storage pop-up.
