# 20 — All Sensors Reporting

## Goal
Every sensor and actuator on the device reaches the dashboard: wire tilt to the server, and add PIR, touch pad, servo, buzzer, vibration and RTC so the Sensors page shows each one working.

## What's missing today (from `../firmware/pill_dispenser/pill_dispenser.ino`)
| Part | Firmware does | Server sees |
|---|---|---|
| Tilt (`checkTamper`) | detects tilted / upright | **nothing** — "Local only" (L480) |
| Vibration (same sensor) | knock / heavy shaking → beeps | nothing |
| PIR (`WAIT_PRESENCE`) | patient arrived / nobody came | only the eventual MISSED (via monitor) |
| Buzzer (`REMINDER`) | reminder before dispensing | nothing |
| Servo (`DISPENSING`) | turns to compartment N | nothing |
| IR (TCRT5000) | pill seen / **NO_DROP** | DISPENSED only; NO_DROP is dropped |
| Touch pad (TTP223) | confirm | CONFIRMED_TAKEN ✅ (card wrongly says "Push button") |
| RTC (DS3231) | keeps time, NTP sync | nothing |
| WiFi | heartbeat sends `uptime`, `rssi`, `stock` | body ignored |

## ⚠ Firmware contract change (additive, flagged per Section 7)
- Firmware starts calling the existing **`POST /api/tilt-event`** `{tilted}` on tilt / upright.
- New **`POST /api/device-event`** `{ "type": "...", "detail"?: string }`, type ∈
  `PRESENCE_DETECTED, NO_PRESENCE, REMINDER, SERVO_ROTATED, PILL_DROP, NO_DROP, KNOCK, SHAKE`.
- `POST /api/device-heartbeat` body **read** (was ignored): `uptime`, `rssi`, `rtc` (new, unix seconds from the RTC). Empty body still OK.
- **Needs a re-flash.**

## Files to create/modify
- `src/db/schema.ts` + migration — `DeviceEvent {id, type, detail?, timestamp}`; `Device.rssi`, `Device.uptimeS`, `Device.rtcDriftS` (nullable);
  `AlertType` += `DISPENSE_FAILED`
- `src/lib/validators.ts` — `deviceEventSchema`, heartbeat schema fields (all optional)
- `src/api/deviceEvent.ts` (new), `src/index.ts`
- `src/api/deviceHeartbeat.ts` — store rssi / uptime / RTC drift (rtc − server time)
- `src/api/sensors.ts` — 10 cards + `events` (last 30 DeviceEvents); `src/types/index.ts`
- `src/pages/SensorsPage.tsx` — new cards + "Device activity" timeline; `src/components/AlertList.tsx`, `AlertBanner.tsx`, `src/types` labels
- `../firmware/pill_dispenser/pill_dispenser.ino`

## Plan
1. `POST /api/device-event`: validate, insert. `NO_DROP` also raises `DISPENSE_FAILED` ("Pill didn't drop from C<n> — check for a jam"),
   dedupe `DISPENSE_FAILED:<detail>`; the next `PILL_DROP` from that compartment resolves it. 201.
2. Heartbeat stores rssi, uptime and RTC drift; response unchanged.
3. Sensors page cards (status icon + label, last seen):
   DHT11 · Tilt & vibration (SW-520D: upright/tilted + knocks/shakes 24h) · IR (drops / no-drops 24h) · **Touch pad (TTP223)** ·
   Load cell · **PIR** (presence detected / nobody came 24h) · **Servo** (last rotation + compartment) · **Buzzer** (last reminder) ·
   **RTC DS3231** (drift vs server; Attention if > 120 s) · ESP32 & WiFi (online + RSSI dBm + uptime).
   Below: "Device activity" — last 30 events with time, newest first.
4. Firmware (all through the existing `postJson`, only on state changes, so ≤ a few requests per dose):
   - `checkTamper`: post tilt-event on tilted and on upright; device-event KNOCK / SHAKE (already 5 s cooldown).
   - Dose cycle: PRESENCE_DETECTED / NO_PRESENCE (`WAIT_PRESENCE`), REMINDER (enter `REMINDER`), SERVO_ROTATED "C<n>" (`dispenseTo`),
     PILL_DROP / NO_DROP "C<n>" (`DISPENSING`).
   - Heartbeat adds `"rtc": rtc.now().unixtime()` minus the IST offset (RTC runs local time) so drift is real.
5. Update `claude.md` (6, 7, 10).

## Assumptions
- Event posting may add up to ~2.5 s (HTTP timeout) per event when the server is down — same as today's dose posts; acceptable.
- Sensors without data yet show "No data yet" (honest) until you run a dose (`d` on serial) — good for the review demo.
- LCD and LED are outputs with no feedback signal; not shown as sensors.

## Verification
- curl each new event type + heartbeat with rssi/uptime/rtc → `/api/sensors` cards change status; NO_DROP raises DISPENSE_FAILED, PILL_DROP clears it; bad type → 400.
- `/sensors` in headless Chrome: 10 cards, activity timeline, no console errors, no overflow at 390 px.
- Firmware compiles with `arduino-cli` (esp32:esp32:esp32). After you flash: tip the device → pop-up within ~10 s; `d` → PIR/buzzer/servo/IR events appear.
- Restore DB test rows. `tsc --noEmit` clean.

## Verification results
- Migration `0009_graceful_magma.sql` applied (DeviceEvent + enum, Device rssi/uptimeS/rtcDriftS, `DISPENSE_FAILED`).
- `device-event`: bad type → 400; NO_DROP C3 → DISPENSE_FAILED "Pill didn't drop from C3 — check the wheel for a jam"; PILL_DROP C3 → resolved.
- Heartbeat with `rtc` +30 s → RTC card "In sync (+30s)"; junk body `{"rssi":"bad"}` → still 200, stored stats untouched.
  The live device's existing heartbeat (`uptime`, `rssi`) is now stored — ESP32 card shows real dBm/uptime before re-flash.
- `/api/sensors`: all 10 cards with expected status/values; `activity` lists events newest first.
- Headless Chrome `/sensors`: 10 cards in 3 groups, Device activity feed (NO_DROP in red), no console errors, no overflow at 390 px.
- Test DeviceEvents/alert removed; `rtcDriftS` reset to null.
- Firmware compiles (esp32:esp32:esp32, core 3.3.12, 84 % flash). **Not flashed.** Pre-change copies in the session scratchpad.
- `tsc --noEmit` clean.
- Deviations: SERVO_ROTATED is posted **with** the drop result, not when the servo turns — posting during `DISPENSING` would block the
  IR check (up to 2.5 s HTTP timeout) and could miss the falling pill. Sensor cards grouped into Environment & safety / Dose cycle /
  Device sections (10 cards in a 3-col grid left an orphan). Heartbeat ignores a malformed body instead of 400 so liveness is never lost.

✅ Completed — tilt, vibration, PIR, buzzer, servo, IR (incl. NO_DROP jam alert), RTC drift and WiFi RSSI/uptime all reach the Sensors page; firmware updated.
