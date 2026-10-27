# 18 — Single Load Cell

## Goal
The device has **one** load cell, so show one weight reading and one trend in the UI instead of a per-compartment breakdown.

## Context
- The real firmware posts `POST /api/stock-alert` with `compartmentNo: 1` (all `StockLog` rows are C1).
- `StockLevel` also holds two stale test rows (C5 0.8 g, C6 1 g, from 2026-09-09). Those cause the
  Sensors page to say "2 compartment(s) low" and the Stock page to show three cards.

## Files to create/modify
- `src/api/sensors.ts` — load-cell card + response field use the **latest reading only**
- `src/types/index.ts` — `SensorsResponse.stock[]` → `loadCell: {...} | null`
- `src/pages/SensorsPage.tsx` — load-cell panel shows one weight instead of a per-compartment list
- `src/pages/StockPage.tsx` — one "Pill weight" card with one chart, instead of a card per compartment

## Plan
1. `sensors.ts`: pick the most recent `StockLevel` row (by `lastUpdated`), whatever its `compartmentNo`.
   Card shows e.g. `8.4 g` with status Attention if below 2 g. The `stock` array is replaced by
   `loadCell: { weight, lastUpdated, lowStock } | null`.
2. `SensorsPage`: the "Load cell" panel shows the big current weight, a Low badge, last updated, and a link to the Stock page.
3. `StockPage` (frontend only, `/api/stock` untouched): take the row with the newest `lastUpdated` as the
   current weight; merge every row's `history`, sort by time and keep the last 30 for one larger chart.
   The card is titled "Pill weight (load cell)", with a Low badge, "Updated …" text, and an empty state when there are no readings.

## Not changing
- `POST /api/stock-alert` and its body (`compartmentNo`, `weight`) — firmware keeps working as-is.
- `GET /api/stock` shape — still per-compartment; the page collapses it.
- The DB rows: the stale C5/C6 rows stay but are ignored because they're older. (Deleting them is a one-line SQL if wanted.)

## Assumptions
- The load cell weighs the whole wheel (total pill weight), not one compartment.
- The low-stock threshold stays 2 g (placeholder in `src/lib/sensors.ts`).
- The `LOW_STOCK` alert message still says "compartment N" (server text) — left alone.

## Verification
- `GET /api/sensors` → `loadCell.weight` = 8.4, and the load-cell card isn't "2 compartment(s) low".
- `/stock` and `/sensors` in headless Chrome: one weight card, one chart, no per-compartment list.
- POST a new reading `{"compartmentNo":1,"weight":1.5}` → both pages show 1.5 g with a Low badge; then restore with an 8.4 g reading.
- `tsc --noEmit` clean.

## Verification results
- `GET /api/sensors`: `loadCell` = 8.4 g (ok); after posting 1.5 g → `lowStock: true`, card "1.5 g (low)" / Attention. No "compartment(s)" text.
- Headless Chrome: `/stock` renders 1 card + 1 chart (Low stock badge at 1.5 g); `/sensors` load-cell panel shows one weight, 0 "Compartment" mentions, no console errors.
- Test reading removed afterwards (StockLog row deleted, StockLevel C1 restored to 8.4 g @ 2026-10-13 16:10:05Z).
- `tsc --noEmit` clean.
- Deviation: `StockChart` y-axis width 36 → 44 px — the top tick ("12g") was clipped to "2g". One-line fix, not in the original file list.

✅ Completed — Stock and Sensors pages show one load-cell weight + one merged trend; `/api/sensors` returns `loadCell` instead of `stock[]`.
