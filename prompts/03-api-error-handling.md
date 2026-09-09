# 03 — API Error Handling (JSON, never HTML)

## Goal
Guarantee every `/api/*` response is JSON — fix the 500-HTML-page gap found in prompt 02 and return a proper 404 when a `scheduleId` doesn't exist.

> **Queue note**: AGENT.md Section 10 lists `03-dashboard-home` next. Inserting this small fix first because it closes a firmware-contract defect in the endpoints prompt 02 just shipped — an ESP32 parsing `Response.json()` would choke on the HTML error page. Dashboard home becomes prompt 04; the rest of the queue shifts by one.

## Files to create/modify
- `src/lib/apiHandler.ts` (new) — `withErrorHandling()` wrapper
- `src/api/dispenseLog.ts` — 404 when schedule not found
- `src/api/confirmTaken.ts` — 404 when schedule not found
- `src/index.ts` — wrap all 6 route handlers

## Plan
1. Add `src/lib/apiHandler.ts` exporting `withErrorHandling(handler)`: runs the handler, catches anything thrown, logs it server-side, returns `Response.json({ error: "Internal server error" }, { status: 500 })`. No stack traces or Prisma messages in the response body — they leak schema details to a device on an open endpoint.
2. In `dispenseLog.ts` and `confirmTaken.ts`, after Zod validation, check the schedule exists (`prisma.schedule.findUnique`); if not, return `Response.json({ error: "Schedule not found" }, { status: 404 })` instead of letting the FK constraint throw.
3. Wrap each of the 6 handlers in `withErrorHandling(...)` in `src/index.ts`'s routes object.

## Assumptions
- **Existence check over catching Prisma's P2003 FK error code**: clearer intent, gives a real 404 rather than reverse-engineering an error code, and costs one cheap indexed lookup. The tiny check-then-write race is irrelevant for a single-device dispenser.
- 500 bodies stay deliberately generic (`"Internal server error"`); details go to the server log only.
- Still no auth on these endpoints — unchanged from prompt 02, out of scope here.
- Not touching the other four handlers' logic — they only get the wrapper.

## Verification
- `POST /api/dispense-log` with a nonexistent `scheduleId` → **404 JSON**, not 500 HTML.
- Same for `POST /api/confirm-taken`.
- Valid requests to all 6 endpoints still behave exactly as verified in prompt 02 (no regressions).
- Malformed body still returns 400 with Zod field errors.
- Force an unexpected throw in a handler → response is JSON 500, not Bun's HTML error page.

## Results
| Check | Result |
|---|---|
| `dispense-log` with nonexistent `scheduleId` | `{"error":"Schedule not found"}` **404 JSON** (was 500 HTML) ✅ |
| `confirm-taken` with nonexistent `scheduleId` | `{"error":"Schedule not found"}` 404 ✅ |
| Malformed body | still 400 with Zod field errors ✅ |
| All 6 endpoints, valid requests | 201/201/200/201/201/200 — no regressions ✅ |
| Forced throw inside a handler | `{"error":"Internal server error"}` JSON 500; stack trace logged server-side only ✅ (temporary throw reverted after testing) |

✅ Completed — All `/api/*` responses are now guaranteed JSON. Unknown `scheduleId` returns 404 instead of a 500 HTML page, and `withErrorHandling` catches anything unexpected without leaking Prisma/stack details to the device.
