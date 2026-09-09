# 10 — Alert Centre

## Goal
A unified alert feed with a resolve action, so alerts can actually be cleared instead of accumulating forever.

## Why this one first
It's the only remaining item that **unblocks broken behaviour** rather than adding a new surface:

- `LOW_STOCK` dedupes per compartment and stays unresolved forever, so after a refill that
  compartment **never alerts again**. Resolving is the missing half of prompt 09's dedup design.
- Same for `STORAGE_CONDITION` — one alert suppresses all future ones until cleared.
- There are already 10 unresolved alerts hidden behind a "+5 more" banner with nowhere to go.

## Files to create/modify
- `src/api/alerts.ts` (new) — `GET /api/alerts`, `PATCH /api/alerts/:id`
- `src/lib/validators.ts` — query + patch schemas
- `src/index.ts` — register routes
- `src/types/index.ts` — alert types
- `src/components/AlertList.tsx` (new)
- `src/components/AlertFilters.tsx` (new)
- `src/pages/AlertsPage.tsx` (new)
- `src/components/Layout.tsx` — "Alerts" nav link with unresolved count badge
- `src/App.tsx` — `/alerts` route
- `src/components/AlertBanner.tsx` — link the banner to `/alerts`

## Plan
1. `GET /api/alerts` — optional `type`, `resolved` (default: unresolved only), `limit`/`offset`.
   Returns `{ alerts, total, limit, offset }`, newest first.
2. `PATCH /api/alerts/:id` — `{ resolved: boolean }`. Returns the updated alert; 404 if unknown.
   Supports un-resolving, so a mis-click is recoverable.
3. `AlertList` — type badge, message, relative time, Resolve/Reopen button per row.
4. `AlertFilters` — type dropdown + a "Show resolved" toggle.
5. `AlertsPage` — filters + list + pagination, refetching after each mutation.
6. Nav link showing the unresolved count; banner on Home links through to `/alerts`.

## Assumptions
- **Resolving is a plain boolean flip, no audit trail.** No `resolvedAt` or `resolvedBy` — there's
  no user model to attribute it to. Flagging because in a real care system "who cleared this
  alert and when" is exactly the kind of thing an audit would ask for.
- **Un-resolving is allowed.** Resolve is one click with no confirmation, so it must be reversible.
- **Default view is unresolved only** — the alert centre is a worklist, not an archive.
- **No bulk "resolve all".** Easy to add, but one careless click clearing every alert in a care
  app is a worse failure than a bit of clicking. Can revisit if it's annoying in practice.
- **Resolving does not verify the condition ended.** Resolving a `LOW_STOCK` while the compartment
  is still empty simply allows the next low reading to alert again — which is the desired
  behaviour, but it does mean "resolved" means "acknowledged", not "fixed".
- Reuses the existing pagination/filter shape from the history page rather than inventing a
  second pattern.

## Verification
- Unresolved alerts listed newest-first; `?type=LOW_STOCK` filters; `?resolved=true` shows the archive.
- Resolve an alert → disappears from the default view, appears under "Show resolved", and the
  nav badge count drops.
- Reopen it → returns to the unresolved list.
- **The unblock, end to end**: resolve a `LOW_STOCK` for a compartment → POST a new low-stock
  reading for that same compartment → a **new** alert is created (proving the dedup no longer
  suppresses it). Before resolving, the same POST creates nothing.
- Home banner count matches the alerts page; banner links to `/alerts`.
- Bad `id`, bad `type`, malformed body → 400/404, never 500.
- Existing pages still work; no console errors.

## Results
API:

| Check | Result |
|---|---|
| Default listing | 11 unresolved, newest-first ✅ |
| `?type=LOW_STOCK` | 5 rows, single type ✅ |
| `?resolved=true` | 2 rows, all resolved ✅ |
| `PATCH` resolve / reopen | 200 with updated row ✅ |
| Bad uuid / unknown id / bad body | 400 / 404 / 400 — no 500s ✅ |
| `type=NOPE`, `limit=999`, `resolved=maybe` | 400 with field errors ✅ |

**The unblock, proven end to end:**
1. `POST /api/stock-alert` for compartment 5 while its alert was unresolved → `alert: null`
   (suppressed, as designed).
2. Resolved that alert.
3. Same POST again → **new alert created** (`0.8g remaining`).

That was the whole point of this prompt: before it, a refilled compartment could never alert again.

UI (driven over CDP):

| Flow | Result |
|---|---|
| Load | 11 rows, "1–11 of 11", nav badge shows 11 ✅ |
| Type filter | 5 rows, all "Low stock" ✅ |
| Resolve one | Range 11 → 10, row gone from active list ✅ |
| Show resolved | Row present, button now reads "Reopen" ✅ |
| Reopen | Back in the active list, count returns to 11 ✅ |
| Home banner | Dead "+5 more" replaced by a working "View all 11 alerts" link ✅ |
| Console errors | None ✅ |

Regression: all 4 routes + 4 dashboard APIs 200, all 5 firmware endpoints 201/200, and the
heartbeat still auto-resolves `DEVICE_OFFLINE`.

## Note
`z_uuid` helper written during implementation was replaced with `z.uuid()` before finishing —
it duplicated validation the codebase already does with Zod everywhere else.

## Still open (unchanged)
- No audit trail on resolve (no user model to attribute it to).
- No bulk resolve — deliberate.
- "Resolved" means acknowledged, not verified fixed.

✅ Completed — Alert centre live at `/alerts` with resolve/reopen, type + resolved filters, pagination and a nav count badge. Resolving now unblocks re-alerting, closing the gap left by prompt 09's dedup.
