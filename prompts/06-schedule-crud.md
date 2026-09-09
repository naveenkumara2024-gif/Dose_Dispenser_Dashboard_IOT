# 05 — Schedule CRUD + Routing

## Goal
Add the schedule management page (create / edit / delete medications and their dose times), and introduce client-side routing now that there's a second page.

## ⚠ Decision needed: what happens when you delete a dose that already has history?
`DispenseLog` has a foreign key to `Schedule`, so deleting a schedule that's already been dispensed either fails or destroys adherence history. Three options:

- **(A) Block the delete — recommended, and what this prompt implements.** Return 409 with "This medication has dose history and can't be deleted." Adherence records are medical history; silently destroying them is worse than refusing. **Downside: a caregiver whose patient stops a medication can never remove it from the dashboard.**
- **(B) Cascade-delete the logs.** Clean UI, but wipes the adherence record for that medication. Not appropriate for a care device.
- **(C) Soft-delete / archive** — the actually-correct answer: add `active Boolean @default(true)` to `Schedule`, hide inactive rows, keep history. **This changes the approved AGENT.md Section 6 schema**, so it needs its own migration prompt rather than being smuggled in here.

Going with (A) now and flagging (C) as the proper follow-up. **Say so at approval time if you'd rather do (C) instead** — it's a better product answer and only a small migration, it just isn't in the approved schema.

## Files to create/modify
- `package.json` — add `react-router-dom`
- `src/lib/validators.ts` — add create/update schemas
- `src/api/schedule.ts` — add `POST`, `PATCH`, `DELETE` handlers alongside existing `GET`
- `src/index.ts` — register `POST /api/schedule` and `/api/schedule/:id`
- `src/components/Layout.tsx` (new) — nav shell
- `src/components/ScheduleTable.tsx` (new)
- `src/components/ScheduleForm.tsx` (new)
- `src/pages/Home.tsx` (new) — dashboard content moved out of `App.tsx`
- `src/pages/SchedulePage.tsx` (new)
- `src/App.tsx` — router + routes
- `src/types/index.ts` — schedule types

> **Revised after prompt 05**: originally written against Prisma. The ORM is now Drizzle + Postgres, so all query code below is Drizzle, ids are UUIDs (validated with `z.uuid()`), and the create path uses `db.transaction()`. Same file per AGENT.md's "revise, don't duplicate" rule.

## Plan
1. Add `react-router-dom`.
2. API — extend `src/api/schedule.ts`:
   - `POST /api/schedule` — creates a `Medication` + its first `Schedule` in one `db.transaction()`.
   - `PATCH /api/schedule/:id` — updates the schedule's `time`/`frequency` and its medication's `name`/`dosage`/`compartmentNo`.
   - `DELETE /api/schedule/:id` — 409 if dose history exists; otherwise deletes the schedule, and the medication too if it has no other schedules left.
   - All return 404 for unknown ids, wrapped in `withErrorHandling`.
3. Zod schemas: `time` matched against `HH:mm`, `frequency` restricted to `daily | weekly`, `compartmentNo` a non-negative int, `name`/`dosage` non-empty.
4. Extract the current dashboard markup from `App.tsx` into `src/pages/Home.tsx` unchanged; `App.tsx` becomes the router.
5. `Layout.tsx`: header + nav links (Home, Schedule) with active styling, wrapping an `<Outlet />`.
6. `SchedulePage.tsx`: fetch list, render `ScheduleTable`, and an add/edit form. Re-fetch after each mutation.
7. Verify in a real browser: create, edit, delete, the 409 path, and validation errors.

## Assumptions
- **`GET /api/schedule` keeps its exact shape** — the ESP32 depends on it (AGENT.md Section 7). Adding POST/PATCH/DELETE on the same path is additive, not a rename, so the firmware contract is untouched. The new methods are dashboard-facing only.
- **One medication : one schedule row, created together.** AGENT.md's schema allows a medication to have many schedules (e.g. 08:00 and 20:00), but the UI treats each row as a "medication + time" pair for simplicity — adding a second time for the same drug creates a second medication row sharing the compartment. Flagging as a real modelling shortcut: it means editing a drug's dosage in one row doesn't update the other. A proper "medication with N times" UI is a bigger form and belongs in its own prompt if wanted.
- `frequency` limited to `daily | weekly` in validation. Nothing consumes `weekly` yet — prompt 04 already flagged that the dashboard treats every schedule as due today regardless of frequency.
- No confirmation dialog on delete beyond the browser's built-in `confirm()` — a styled modal is polish (prompt 10).
- No auth, unchanged from earlier prompts.

## Verification
- Create a medication via the form → appears in the table and in `GET /api/schedule`.
- Edit it → changes persist after a reload.
- Delete a schedule with **no** history → row disappears.
- Delete a schedule **with** history → 409, UI shows a readable message, row stays.
- Invalid input (bad time like `25:00`, empty name, negative compartment) → 400 with a field error shown, no crash.
- Both routes reachable via nav; the home dashboard still renders exactly as it did in prompt 04.
- Browser-verified with screenshots; no console errors.

## Results
API layer (curl):

| Check | Result |
|---|---|
| `POST /api/schedule` | 201, medication + schedule created in one transaction ✅ |
| `PATCH /api/schedule/:id` | 200, updates fields across both tables ✅ |
| `DELETE` with no history | 204, row gone, orphaned `Medication` cleaned up too ✅ |
| `DELETE` with dose history | 409 with the explanatory message, row kept ✅ |
| Bad time `25:00` / empty name / negative compartment | 400 with per-field errors ✅ |
| `PATCH` unknown id | 404 ✅ |

UI layer — driven for real over Chrome DevTools Protocol (not just screenshotted), so the click-through wiring is actually exercised:

| Flow | Result |
|---|---|
| Add "Warfarin 5mg, compartment 3, 19:45" via the form | Row count 1 → 2, appears in table ✅ |
| Submit with the name cleared | Inline "Name is required" under the field ✅ |
| Edit Warfarin's dosage → `2.5mg` | Table reflects `2.5mg` after save ✅ |
| Delete Warfarin (no history) | Row count 2 → 1 ✅ |
| Delete Metformin (has history) | Amber banner shows the 409 message, row remains ✅ |
| Console errors | None ✅ |

Home dashboard re-verified after the refactor into `pages/Home.tsx` — renders as before, now with the nav bar.

## Deviation from plan
**`withErrorHandling` made generic** (`src/lib/apiHandler.ts`, not in the planned file list). The `:id` routes need `BunRequest<"/api/schedule/:id">` for `req.params.id` to be typed, but the wrapper hardcoded the non-parameterised `BunRequest`, so wrapping the PATCH/DELETE handlers was a type error. Now `withErrorHandling<T extends string>` preserves the route's param type.

## Still open
- **Delete policy is option (A)** — refusing deletion when history exists. A caregiver still can't remove a discontinued medication; option (C), an `active` archive flag, remains the better answer and needs a schema prompt.
- **AGENT.md is still stale** from prompt 05 (Sections 4/6/9 describe Prisma + SQLite).

✅ Completed — Schedule CRUD live on Drizzle with client-side routing. All create/edit/delete/validation/409 flows verified by driving the real UI, not just by hitting the API.
