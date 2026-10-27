# 22 — Real-time Dashboard over WebSocket

## Goal
Every change on the device or in the database appears on every open dashboard instantly (well under 1 s), with live sensor values streaming while someone is watching, and REST kept as a fallback.

## Where the delay comes from today
| Path | Today | After |
|---|---|---|
| Dashboard refresh | Sensors page and alert pop-up poll every **10 s**; Home, Stock, History, Alerts and Schedule fetch **once** and go stale until reload | Server pushes; page refetches in < 150 ms |
| Schedule → device | ESP32 polls `GET /api/schedule` every **15 s** | Pushed to the device the moment it's saved |
| Device → server | New HTTP connection per event (blocking, up to 2.5 s timeout) | One persistent socket, non-blocking |
| Device online/offline | Heartbeat window: offline after **5 min** | Socket closed → offline after a 20 s grace period |
| Sensor values | DHT11 every 60 s, weight every 5–60 s, PIR/IR/touch never shown live | Live stream (below) while a dashboard is open |

Values can only be as fresh as the hardware allows: DHT11 maxes out at about 1 reading/s, and one weight reading takes about 0.7 s (7 HX711 samples). "Instant" means pin sensors (PIR, IR, touch, tilt) within ~100 ms, weight about every 1 s, and temperature/humidity about every 2 s.

## Architecture
```
ESP32 ──ws://<server>:3000/ws?role=device──▶ Bun hub ──publish "dashboard"──▶ browsers (/ws?role=dashboard)
        ◀── schedule push, watch on/off, commands ──┘   └─▶ same service functions as REST ─▶ Postgres
```
- **One shared code path:** each REST handler's core logic moves into `src/services/*` (validate → write → raise/resolve alerts). REST routes and WebSocket messages both call it, so the database ends up identical whichever transport delivered the data.
- **Invalidate, then refetch:** the server tells dashboards *what changed* (`invalidate: ["sensors","stock"]`); each page refetches its own endpoint. Page data keeps one shape and one source. Invalidations are coalesced over 200 ms so a burst of events causes one refetch.
- **Live telemetry is separate from history:** streamed values go to dashboards and are kept in server memory as "latest", but are **never written to the database** (1 Hz would be about 86k rows/day). Stored readings keep today's cadence.
- **Alerts are pushed at one choke point:** `raiseAlert()` publishes the new alert, so the pop-up opens immediately, whether the alert came from the device, the monitor job or the API.

## ⚠ Firmware contract change (flagged per Section 7)
- New device transport **`/ws?role=device`**. **All REST endpoints stay unchanged** and become the fallback when the socket is down, so existing firmware, curl tests and the review doc keep working.
- New protocol below. The firmware needs the Arduino library **WebSockets** (Markus Sattler / Links2004) installed, plus a re-flash.

## Message protocol (JSON, `{"t": "<type>", ...}`, Zod-validated both ways)
| Direction | `t` | Payload | Notes |
|---|---|---|---|
| device → server | `hello` | `fw`, `boot` (random id per boot) | Server replies `schedule` + `watch` |
| | `hb` | `uptime`, `rssi`, `rtc` | Replaces the heartbeat POST; socket ping/pong (15 s) detects dead links |
| | `env` | `temperature`, `humidity` | Stored, as `/environment-log` |
| | `stock` | `weight`, `percent?` | Stored, as `/stock-reading` |
| | `stock_low` | `weight` | As `/stock-alert` |
| | `tilt` | `tilted` | As `/tilt-event` |
| | `event` | `type`, `detail?` | As `/device-event` |
| | `dose` | `status`, `scheduleId`, `eid` | As dispense-log / confirm-taken; acked |
| | `live` | `w`, `t`, `h`, `pir`, `ir`, `touch`, `tilt`, `state` | **Not stored.** Sent on any pin change and every 1 s while watched |
| | `ack` | `id`, `ok`, `msg` | Result of a command |
| server → device | `schedule` | same array as `GET /api/schedule` | On connect and on every schedule change |
| | `watch` | `on` | On when ≥ 1 dashboard is connected; telemetry stops when nobody watches |
| | `cmd` | `id`, `name`, `arg?` | `tare`, `full`, `dispense` (1–5), `status`, `tilt_learn` |
| server → dashboard | `hello` | device online state, latest `live` snapshot | So a new tab is populated instantly |
| | `invalidate` | `keys[]` ⊂ `dashboard, sensors, stock, history, alerts, schedule` | Coalesced over 200 ms |
| | `alert` | alert row | Opens the pop-up instantly |
| | `live` | telemetry + `at` | Forwarded as received |
| | `device` | `online` | On socket open / close (after grace period) |
| | `cmd_result` | `id`, `ok`, `msg` | Phase C |
| dashboard → server | `cmd` | `name`, `arg?` | Phase C; forwarded to the device with an id |

**Dose events must not be lost or doubled.** Each `dose` carries `eid` = `<boot>-<counter>`. The server acks it. With no ack within 3 s, the device retries over HTTP with the same `eid`. A nullable `DispenseLog.clientEventId` with a unique index makes a retry a no-op, so adherence is never double-counted.

## Plan (three phases, each verified before the next)
**Phase A — server push to dashboards (no firmware change; immediate win)**
1. `src/ws/protocol.ts`: Zod discriminated unions for every message above; types shared with the frontend.
2. `src/ws/hub.ts`: connection registry (one device slot, newer replaces older; any number of dashboards), `publish`, coalesced `invalidate`, latest-telemetry cache, socket online state with a 20 s grace period. Uses Bun's built-in WebSocket (`server.upgrade` on the `/ws` route; `websocket` handlers in `Bun.serve`), 64 KB max payload, and telemetry is dropped when a socket is backpressured.
3. `src/services/*`: extract the core of environment, stock, stock-alert, tilt, device-event, heartbeat, dispense and confirm. REST handlers become thin wrappers. Every service write → `invalidate`. Schedule/medication/alert writes and the monitor job publish too. `raiseAlert` → `alert`.
4. Frontend `src/lib/live.tsx`: one shared socket (React context), exponential-backoff reconnect (1 s → 30 s), `useLiveQuery(url, keys)` (fetch on mount and on matching `invalidate`), `useTelemetry()`. While disconnected, it falls back to 30 s polling.
5. Replace polling and one-shot fetches on Home, Schedule, History, Stock, Sensors, Alerts, the Layout alert badge and AlertPopup.
6. `LiveIndicator` in the nav: ● Live / ◌ Reconnecting… / ○ Offline (polling).

**Phase B — device on WebSocket**
7. Firmware: `WebSocketsClient` (non-blocking, `loop()` driven, auto-reconnect 5 s, heartbeat 15 s/3 s/2). A `send()` helper uses the socket when connected and falls back to today's `postJson` otherwise. Remove the 15 s schedule poll while the socket is up (keep HTTP GET as the fallback).
8. Live mode on `watch on`: pin states sent on change (checked every 50 ms) plus a 1 s snapshot, weight every 1 s, DHT11 every 2 s. Stored readings keep their current cadence. Never sent during `DISPENSING`, so the IR timing is protected (same rule as today).
9. `dose` with `eid` + ack/HTTP retry; migration for `DispenseLog.clientEventId` + unique index.
10. Device online = socket connected **or** heartbeat within 5 min (an HTTP-only firmware still counts).
11. `scripts/fake-device.ts`: a WebSocket device simulator (all message types, telemetry, commands). Used for tests, and for demos without the hardware.

**Phase C — device controls on the dashboard** (needs your yes, see decisions)
12. Sensors page "Device controls": Tare, Set full, Test dispense C1–C5 (confirm dialog), Re-learn tilt, Status. Shows `cmd_result` inline. Buttons are disabled while the device is offline or mid-dose.

**Docs:** `claude.md` (stack, protocol, Section 7) and `PROJECT_REVIEW.md` (architecture, real-time section).

## Files
- New: `src/ws/protocol.ts`, `src/ws/hub.ts`, `src/ws/deviceRouter.ts`, `src/services/{environment,stock,tilt,deviceEvent,heartbeat,dose}.ts`, `src/lib/live.tsx`, `src/components/LiveIndicator.tsx`, `src/components/DeviceControls.tsx` (C), `scripts/fake-device.ts`
- Modify: `src/index.ts`, `src/api/*` (thin wrappers + publish), `src/lib/alerts.ts`, `src/jobs/monitor.ts`, `src/db/schema.ts` + migration, `src/types/index.ts`, all pages, `Layout.tsx`, `AlertPopup.tsx`
- Firmware: `../firmware/pill_dispenser/pill_dispenser.ino`

## Decisions needed (my recommendation first)
1. **Keep REST as a fallback (recommended)** or remove it? Removing it breaks the fallback when the socket is down, curl testing, older firmware and the review doc's API section, and gains nothing in speed.
2. **Phase C remote controls: yes or no?** They make calibration and demos much easier (tare/full/test from the browser, no Serial Monitor). But there is **no auth** (deferred), so anyone on the Wi-Fi could move the servo. If yes, I recommend a minimal shared `DEVICE_KEY` (in `.env` + firmware) for the device socket and the `cmd` messages, as the one exception to "auth deferred".
3. Live telemetry at 1 s for weight and 2 s for DHT11: OK, or slower?

## Assumptions
- Bun 1.3.14 supports upgrading on a `routes` entry. Step 2 starts with a 5-minute spike; if that fails, `/ws` moves to the `fetch` fallback handler. The `/ws` route still follows the "every route wrapped" rule, returning nothing on a successful upgrade.
- I install the `WebSockets` Arduino library via the IDE's `arduino-cli` (`lib install WebSockets`) to compile. Flash use rises by about 30–40 KB (currently 84 %, so it fits).
- `ws://` (not TLS) on the LAN, matching today's `http://`.
- One device (`default`), as today.

## Verification
- **Latency:** fake device → dashboard socket: event to `invalidate` received **< 50 ms**, event to refetched data **< 150 ms** p95 on localhost (measured and printed by a script over 100 events).
- **Every page updates without reload** in headless Chrome when the fake device sends env / stock / tilt / dose / event messages, and when another tab edits the schedule or resolves an alert.
- **Pop-up:** opens < 1 s after `tilt: true`. Live tiles change on `live` messages. The indicator shows Live → Reconnecting → Live across a server restart, and pages fall back to polling meanwhile.
- **Device:** schedule edits reach the device (`[ws] schedule` in serial) < 1 s. Pulling the server makes the firmware fall back to HTTP; reconnect restores the socket. A duplicate `eid` stores one DispenseLog row.
- **Equivalence:** the same message sent via REST and via WebSocket produces identical DB rows and alerts. All earlier curl checks still pass.
- **Robustness:** invalid JSON / unknown `t` / oversized messages → an `err` reply, the socket stays up, the server doesn't crash. A second device connection replaces the first.
- `tsc --noEmit` clean; firmware compiles for `esp32:esp32:esp32`; DB test data cleaned up afterwards.

## Verification results
- **Scope as approved:** decision 1 = keep REST as fallback; Phase C (device controls) **not built** (no explicit yes); default live rates.
- Migration `0010_wild_prowler.sql` (`DispenseLog.clientEventId` + unique index).
- **Latency** (`scripts/ws-latency.ts`, localhost, against the running dev server): live hop p50 0.1 ms / p95 0.1 ms;
  event → `invalidate` p50 5.8 ms / p95 7–11 ms; → refetched data p50 9.4 ms / p95 35–41 ms (targets < 50 / < 150 ms). Max ~146 ms = first cold event.
- **Robustness (18/18):** schedule + watch pushed on connect; invalid JSON / unknown `t` / bad field / bad uuid → 4 `err` replies, socket stays up;
  second device replaces first (close 4000); oversized frame closes only that socket, server keeps serving; dose acked over WS,
  HTTP resend with same eid → 200 (one row), new eid → 201; unknown schedule → `dose_ack ok:false`; schedule PATCH → push to device +
  `invalidate schedule`; tilt → `alert` pushed; dashboard messages rejected; `watch off` when the last dashboard leaves.
- **Browser** (headless Chrome, private server on :3001): indicator Live → Reconnecting on server kill → Live after restart;
  live tiles update without reload; new event in the activity feed ~208 ms after the device sent it; no page errors; no overflow at 390 px.
- **Firmware frames** sent byte-for-byte as the C code builds them (hello, hb with extra `stock`, live calibrated/uncalibrated) → all accepted;
  schedule push carries id/time/compartmentNo/frequency as `applySchedule()` reads.
- Firmware compiles (`esp32:esp32:esp32`, core 3.3.12, WebSockets 2.7.2): **91 % flash** (was 84 %); offline build (`ENABLE_SERVER` off) also compiles. **Not flashed.**
- `tsc --noEmit` clean. All test rows/alerts removed; one false DEVICE_OFFLINE from a crashed test run deleted.
- **Deviations:** pages keep their own `load()` and subscribe via `useLiveRefresh(keys, load)` (same behaviour as the planned `useLiveQuery`, smaller diff);
  telemetry fields `temp`/`hum` (not `t`/`h` — `t` is the envelope type); invalidations coalesce leading-edge (first goes out at once) so isolated events aren't delayed 200 ms;
  HX711 now sampled non-blocking into a ring buffer (needed so weight can refresh every 1 s without stalling the loop);
  firmware gates its own reconnects (5→60 s backoff, idle only) because the library's connect blocks up to 5 s; live tilt bit uses the debounced state;
  firmware clamps a negative weight in `stock_low` (server rejects negatives — pre-existing REST bug); `/ws` route uses inline try/catch (upgrade returns nothing).
- **Found, not fixed (testing artefact):** a fake device socket closing while the real device is HTTP-only can raise a false DEVICE_OFFLINE after 20 s;
  the real WS firmware avoids it by sending an HTTP heartbeat immediately on disconnect. `ws-latency.ts` waits out the grace period and cleans it up.

✅ Completed — real-time WebSocket link (device + dashboards) with REST fallback, live telemetry, schedule push, idempotent doses; verified end to end except on the physical device (needs flash).
