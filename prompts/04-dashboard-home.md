# 04 — Dashboard Home

## Goal
Build the caregiver home view (AGENT.md Section 8): today's schedule, adherence %, alert banner, and device online/offline status.

## Files to create/modify
- `src/api/dashboard.ts` (new) — `GET /api/dashboard` aggregate read endpoint
- `src/api/deviceHeartbeat.ts` — export a `isDeviceOnline()` helper alongside the existing getter
- `src/index.ts` — register the new route
- `src/components/AlertBanner.tsx` (new)
- `src/components/DashboardStats.tsx` (new)
- `src/components/TodaySchedule.tsx` (new)
- `src/App.tsx` — compose the three components into the home layout

## Plan
1. Add `GET /api/dashboard` returning one payload: `{ todaysDoses[], adherencePct, activeAlerts[], device: { online, lastSeenAt } }`.
2. Add `isDeviceOnline()` to `deviceHeartbeat.ts` (heartbeat within the last 5 minutes).
3. Register the route in `src/index.ts`, wrapped in `withErrorHandling` like the rest.
4. Build the three presentational components using the existing shadcn `Card` primitives + Tailwind.
5. `App.tsx`: one `useEffect` fetch of `/api/dashboard` into state, with loading and error states; render banner → stats → today's schedule.
6. Verify in the browser against real data in `dev.db`.

## Why a new endpoint (and why one, not four)
The home view needs data none of the 6 firmware endpoints expose: adherence has no endpoint, alerts have no endpoint, and `/api/device-heartbeat` is POST-only (the device writes, nothing reads). AGENT.md Section 7's contract is *firmware-facing* and stays untouched — this is an additive, dashboard-only route, no renames. Aggregating into a single `/api/dashboard` keeps it to one round trip, matching AGENT.md Section 4's "fewer round trips" rationale.

## Assumptions
- **No Server Components / Server Actions.** AGENT.md Section 4 specifies them, but they're Next.js features and this is a Bun + React SPA (deviation already flagged in prompt 01). Data fetching is a client-side `fetch` in `useEffect`. This is the single biggest unavoidable departure from the documented stack.
- **Adherence % = `CONFIRMED_TAKEN / DISPENSED` over the last 7 days.** The schema has no "expected doses" table to compare against, so adherence is measured against doses the device actually dispensed, not against doses that *should* have happened. Shows "—" when there are no dispenses yet rather than a misleading 0%. Flagging because a caregiver might reasonably expect the second definition — it would need a schedule-expansion calculation, and probably its own prompt.
- **"Today's doses"** = every `Schedule` row, each annotated with today's latest `DispenseLog` status (`CONFIRMED_TAKEN` > `DISPENSED` > pending). `frequency` is currently a free-text string (`"daily"`, `"weekly"`, …) with no parser, so **all schedules are treated as due today** regardless of frequency. Correct for `"daily"`, wrong for `"weekly"` — a real frequency parser is out of scope here; flagging rather than faking it.
- **Device online = heartbeat within 5 minutes**, read from the in-memory value from prompt 02 — so it reports offline after any server restart until the next ping. Persisting it still needs a schema change (no Device model), unchanged from prompt 02.
- **No router yet.** Home is the only page; `App.tsx` renders it directly. Routing gets introduced when a second page exists (prompt 05) rather than scaffolding nav for pages that aren't built — per AGENT.md Section 3, no speculative scaffolding.
- Alert banner shows unresolved alerts only (`resolved: false`), newest first, capped at 5 with a "+N more" count. No resolve/dismiss action — that belongs to the alerts page (prompt 08).

## Verification
- `curl localhost:3000/api/dashboard` returns the 4 keys with sensible values against existing `dev.db` data.
- Home page renders in the browser: alert banner (LOW_STOCK rows from prompt 02 testing are already in the DB), adherence %, device status, today's schedule showing the Metformin 08:00 entry.
- Device shows offline before any heartbeat, flips to online after `POST /api/device-heartbeat`, on refresh.
- Loading and empty states render without crashing (verify empty by checking a schedule-free response path).
- No console errors in the browser.

## Results
Verified by rendering the real page in headless Edge (screenshots captured), not just by curling the API:

| Check | Result |
|---|---|
| `GET /api/dashboard` | Returns all 4 keys with correct values ✅ |
| Home page renders | Alert banner (3 LOW_STOCK), stats row, Metformin 08:00 "Taken" ✅ |
| Device status | "Offline / No heartbeat received yet" → after `POST /api/device-heartbeat`, "● Online / Last seen 8:11:17 pm" ✅ |
| Empty state | Adherence "—" (not a misleading 0%), banner hidden, "No medications scheduled yet." ✅ |
| Console errors | None echoed to the server log ✅ |

Empty state was tested by clearing the DB against a **backup copy**, then restoring — the prompt-02 test data (Metformin schedule, alerts, logs) is intact.

## Extra fixes needed to unblock this prompt (outside the planned file list)
`src/logo.svg`, `src/react.svg`, and `src/APITester.tsx` had been deleted from the template (not by this prompt's work — `APITester` called the `/api/hello` routes removed in prompt 02). Two dangling references to the deleted SVG broke the build:
- `src/index.html` — removed the `<link rel="icon" href="./logo.svg">`; also set the title to "Pill Dispenser Dashboard" (was "Bun + React").
- `src/index.css` — removed the decorative `body::before` Bun-logo background + its `slide` keyframes, and the now-unused `spin` keyframes. Also dropped `grid place-items-center` from `body`, which would have vertically centered the dashboard instead of letting it flow from the top.

No favicon is declared now. Worth adding a real one during polish (prompt 10).

✅ Completed — Dashboard home live: aggregate `/api/dashboard` endpoint + AlertBanner, DashboardStats, and TodaySchedule components, verified rendering in a real browser with populated and empty data.
