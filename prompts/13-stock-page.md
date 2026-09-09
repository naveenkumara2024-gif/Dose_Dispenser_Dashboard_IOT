# 13 — Stock Page

## Goal
Current weight per compartment with a low-stock badge, and a real depletion trend chart (first Recharts use).

## ⚠ There is currently no stock history to chart, at all
`StockLevel` is **upserted** by compartment on every `POST /api/stock-alert` — each new
reading overwrites the last (`src/api/stockAlert.ts`, unchanged since prompt 02). Nothing
else writes stock data. So every reading that's ever been reported is gone the moment the
next one for that compartment arrives. Section 8's "depletion trend chart" has been
structurally impossible since the very first prompt — there was never anything to plot.

**Fix: add an append-only `StockLog` table.** `StockLevel` keeps doing exactly what it does
today (fast "current weight" lookup, one row per compartment) — nothing about the existing,
already-tested upsert behavior changes. `POST /api/stock-alert` additionally inserts one
`StockLog` row per reading. The chart plots from `StockLog`, which starts empty and fills in
from this point forward. **Historical depletion before today is unrecoverable** — the raw
readings were never kept.

## Files to create/modify
- `src/db/schema.ts` — add `StockLog` table
- `drizzle/` — migration
- `src/api/stockAlert.ts` — also insert into `StockLog`
- `src/api/stock.ts` (new) — `GET /api/stock`: current levels + per-compartment history
- `src/index.ts` — register the route
- `package.json` — add `recharts`
- `src/types/index.ts` — stock types
- `src/components/StockChart.tsx` (new)
- `src/pages/StockPage.tsx` (new)
- `src/components/Layout.tsx` / `src/App.tsx` — nav link + route

## Plan
1. `StockLog { id uuid PK, compartmentNo integer, weight double, timestamp timestamptz default now() }`.
   Migrate.
2. `stockAlert.ts`: after the existing `StockLevel` upsert, insert a `StockLog` row with the
   same reading. Two writes, same request; existing response shape unchanged.
3. `GET /api/stock` returns, per compartment that has **either** a `StockLevel` row or an
   active medication assigned to it (union, so a medication with no reading yet still shows):
   `{ compartmentNo, medicationName, weight, lastUpdated, lowStock, history: [{weight, timestamp}] }`.
   `history` capped to the last 30 readings.
4. Install `recharts`. `StockChart`: one line per compartment (or small-multiples, see
   Assumptions), X = timestamp, Y = weight.
5. `StockPage`: a card per compartment — name, current weight, low-stock badge — plus the chart.
6. Nav link + route.

## Assumptions
- **Low-stock threshold is a placeholder: weight < 2g.** There's no "capacity"/"full weight"
  field in the schema, so a percentage-based badge isn't computable — this mirrors the
  environment page's placeholder temperature/humidity thresholds from prompt 08. Trivial to
  change in one place once a real capacity is known; flagging rather than guessing at one.
- **Only active medications are matched to a compartment.** Compartment 1 currently has both
  an active (`metform`) and an archived (`Metformin`) medication — showing the archived one
  on a live stock view would be misleading. Consistent with the rest of the app already
  hiding archived medications by default.
- **A compartment with a `StockLevel` row but no medication still shows** (as "Unassigned"),
  rather than being hidden — the device is reporting real hardware state and hiding it would
  make the page lie about compartments that exist physically.
- **Small multiples over one combined chart.** Different medications' quantities aren't on
  comparable scales, and a single combined line chart with 5+ series gets unreadable fast.
  One small chart per compartment scales better as compartments are added.
- **History capped at 30 points per compartment** — enough to show a trend, not an unbounded
  page load as data accumulates for months.
- Uses the dataviz guidance already loaded for this session for chart styling/colors, since
  this is the first chart in the app and there's no established visual precedent to match yet.

## Verification
- Migration adds `StockLog`; `POST /api/stock-alert` now writes both `StockLevel` (unchanged
  shape) and a new `StockLog` row — confirm both in Postgres after a call.
- `GET /api/stock` shows a compartment with a medication and no reading (weight/history empty,
  not an error), a compartment with a reading and no medication ("Unassigned"), and a normal
  compartment with both.
- Send 3 readings to the same compartment a few seconds apart → chart shows 3 points, not 1 —
  proving history actually accumulates instead of being overwritten like `StockLevel` is.
- Weight below 2g shows the low-stock badge; above does not.
- Compartment 1 shows only the active medication (`metform`), not the archived `Metformin`.
- Browser-verified: chart renders with real data, page reachable from nav, no console errors,
  other pages unaffected.

## Results
| Check | Result |
|---|---|
| Migration | `StockLog` created; `StockLevel` unchanged ✅ |
| `POST /api/stock-alert` | Writes both tables — `StockLevel` stays 1 row/compartment, `StockLog` appends ✅ |
| Compartment w/ medication, no reading | Shows `weight: null`, empty history, no error ✅ |
| Compartment w/ reading, no medication | Shows `medicationName: null` → "Unassigned" ✅ |
| 3 readings, 1s apart, same compartment | `StockLevel` still 1 row (latest: 7.5g); `StockLog` has all 3, ascending by time ✅ |
| Threshold boundary | 1.99g → `lowStock: true`; 2.01g → `false` — exact ✅ |
| Compartment 1 (has archived "Metformin" + active "metform") | Shows **metform** only ✅ |
| Chart | Renders a real 3-point declining line, blue stroke, hairline grid, dots — screenshot-verified ✅ |
| Regression | All 5 routes 200, no console errors ✅ |

## A bug caught before it shipped
The first version of `GET /api/stock` selected `db.select().from(medication)` with a comment
claiming "only active medications" — but **`active` lives on `Schedule`, not `Medication`**.
Compartment 1 has two medication rows: `metform` (active schedule) and `Metformin` (its
schedule was archived back in prompt 08). The naive query would have shown **both**, including
one the caregiver already removed from the schedule page. Fixed by joining through `Schedule`
and only counting a medication as active if at least one of its schedules is — confirmed the
fix by testing compartment 1 directly, which correctly shows `metform` only.

## Dataviz skill applied
Loaded before writing any chart code. Single-series small multiples → sequential blue
(`#2a78d6`, palette.md), 2px line, hairline gridlines, hover tooltip (Recharts `<Tooltip>`),
no legend (one series needs none — the card title already says what it is). Low-stock badge
reuses the app's existing amber Tailwind classes rather than the skill's raw status hex, for
visual consistency with every other badge already in this app (AlertBanner, AlertList,
DoseHistoryTable) — a deliberate exception to keep one visual language across pages that
predate this skill's use.

## Note
Compartments 5 and 6 carry "Unassigned, low stock" test readings left over from prompts 9/10
(not this prompt's test data, which was cleaned up). Harmless — just orphaned test artifacts
from earlier work, not touched here since removing older data is out of this prompt's scope.

✅ Completed — Stock page live at `/stock` with a real depletion trend chart. Caught and fixed an "active medication" filtering bug (checked the wrong table's flag) before it reached the browser.
