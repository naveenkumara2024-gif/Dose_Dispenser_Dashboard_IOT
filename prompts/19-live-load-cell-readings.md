# 19 — Live Load-Cell Readings

## Goal
Make the dashboard's pill weight update live, by having the firmware report routine load-cell readings (not only the one-off low-stock alert).

## Root cause
- `firmware/pill_dispenser/pill_dispenser.ino` `updateStock()` (L400-418) reads the HX711 every 5 s but only
  POSTs `/api/stock-alert` when stock < 20 % of full, **once** (latched by `lowAlertSent` until > 30 %).
- So the server has exactly one reading (8.4 g, 2026-10-13) and nothing since. The device is otherwise online
  (environment + heartbeat arrive every ~minute).
- `/api/stock-alert` can't simply be called more often: it **always** raises a LOW_STOCK alert, which is
  why there's a bogus "Low stock … 8.4g" alert open now.

## ⚠ Firmware contract change (additive, flagged per Section 7)
- New endpoint **`POST /api/stock-reading`**, body `{ "compartmentNo": 1, "weight": 42.3, "percent": 68 }`
  (`percent` optional — omitted while the wheel isn't calibrated with `f`).
- `/api/stock-alert` is **unchanged** and the firmware keeps calling it on low stock, as today.
- **Needs a re-flash** of the ESP32.

## Files to create/modify
- `src/db/schema.ts` + `drizzle/` migration — nullable `percent` double on `StockLevel` and `StockLog`
- `src/lib/sensors.ts` — `LOW_STOCK_PCT = 20` (matches firmware); low = `percent < 20` if known, else the 2 g placeholder
- `src/lib/validators.ts` — `stockReadingSchema` (`weight` ≥ 0, `percent` 0-100 optional)
- `src/api/stockReading.ts` (new) + `src/index.ts` route
- `src/api/stockAlert.ts` — store `percent: null` explicitly (no behavior change)
- `src/api/stock.ts`, `src/api/sensors.ts` — return `percent`; low uses the shared rule
- `src/types/index.ts`, `src/pages/StockPage.tsx`, `src/pages/SensorsPage.tsx` — show "68 % full" next to grams
- `../firmware/pill_dispenser/pill_dispenser.ino` — `updateStock()` reports readings

## Plan
1. Server `POST /api/stock-reading`: Zod-validate, upsert `StockLevel`, append `StockLog` (same as stock-alert),
   then if `percent` is present: < 20 → `raiseAlert(LOW_STOCK)`, ≥ 20 → `resolveAlerts("LOW_STOCK:<n>")` (refill clears it).
   No percent → store only, no alert logic. 201 `{ stockLevel, alert }`.
2. Firmware `updateStock()`: after reading, POST `/api/stock-reading` when **weight moved ≥ 0.5 g** since the
   last report (a pill dropped / refill) **or 60 s** passed (`STOCK_REPORT_MS`). Include `percent` only when
   `fullG > 1`. The existing low-stock `/api/stock-alert` call stays as-is.
3. UI: weight card shows `42.3 g · 68 % full` when percent is known; Low badge from the shared rule.
4. Resolve the bogus open "Low stock … 8.4g" alert once (it was raised by the stock-alert-always-alerts behavior).
5. Update `claude.md` Sections 6, 7, 10.

## Assumptions
- The wheel has been calibrated on the device (`t` tare + `f` full); otherwise only grams show (no %).
- 0.5 g / 60 s thresholds: fine for a demo (≤ 1 request/min when idle; HX711 noise is under 0.5 g with `get_units(5)`).
- I can edit `../firmware/` even though it's outside this repo — you flash it.

## Verification
- `curl POST /api/stock-reading {"compartmentNo":1,"weight":42.3,"percent":68}` → 201; `/stock` + `/sensors` show 42.3 g · 68 %.
  `percent: 10` → LOW_STOCK raised; `percent: 80` → resolved. Bad body → 400. Then restore DB.
- Firmware: compile check with `arduino-cli` if installed (else you compile/flash); serial shows `[net] POST /api/stock-reading -> 201`
  and `StockLog` gains rows every minute / per pill.
- `tsc --noEmit` clean.

## Not in this prompt (noticed while reading the firmware)
- The firmware detects tilt but **never posts it** (`// Local only: the server has no tamper endpoint` L448) — so the
  `/api/tilt-event` endpoint from prompt 16 receives nothing. Separate prompt (20) if you want it wired.
- The device also has PIR, touch pad, buzzer and servo, which the Sensors page doesn't show yet.

## Verification results
- Migration `0008_lean_tempest.sql` applied (`percent` on StockLevel + StockLog).
- `POST /api/stock-reading`: bad weight / percent 140 → 400; 42.3 g 68 % → 201, `/api/sensors` card "42.3 g · 68%";
  10 % → LOW_STOCK "Low stock: 6.2g remaining (10% full)" raised; 80 % → resolved; uncalibrated −0.3 g → stored as 0, no alert.
- The bogus open "Low stock in compartment 1 (8.4g remaining)" alert was resolved by the 68 % test reading (plan step 4).
- Test rows/alert removed afterwards; StockLevel C1 restored to 8.4 g @ 2026-10-13.
- Firmware compiled with the IDE's bundled `arduino-cli` (`esp32:esp32:esp32`, core 3.3.12): 84 % flash. **Not flashed** — user flashes.
- `tsc --noEmit` clean.
- Deviations: `weight` on stock-reading accepts negatives and clamps to 0 (HX711 drift around a tared empty platform would
  otherwise 400 and drop readings). Firmware retries a failed post after 15 s, not every 5 s, so a down server doesn't stall the loop
  with 2.5 s timeouts. `recordStockReading()` is shared by both stock endpoints instead of duplicating the upsert.

✅ Completed — `POST /api/stock-reading` + firmware reports weight every 60 s / on ≥0.5 g change, with % full; low alert raises and clears from %.
