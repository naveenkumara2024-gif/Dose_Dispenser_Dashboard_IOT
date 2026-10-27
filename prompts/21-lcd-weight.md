# 21 — Show Load-Cell Weight on the LCD

## Goal
Show the live load-cell weight in grams on the device's 16×2 LCD idle screen.

## Constraint
Both idle rows are already full (16 chars max):
- Row 1: `21:05 33C 68%` (time, temp, humidity)
- Row 2: `Next 08:00 S68%` (next dose + stock %), or `LOW STOCK Refill` / `TILTED! Upright`

So the weight takes turns with row 2 rather than squeezing in and getting truncated.

## Files to modify
- `../firmware/pill_dispenser/pill_dispenser.ino` — `showIdle()` and one constant (firmware only; no server/dashboard change)

## Plan
1. Add `LCD_ROTATE_MS = 3000`: row 2 alternates every 3 s between its current text and a weight line.
2. Weight line: `Weight 42.3 g` (one decimal below 100 g, whole grams above, e.g. `Weight 123 g`).
   Small negative HX711 drift around an empty tared platform shows as `0.0 g`.
3. Rotation applies to the normal line (`Next 08:00 S68%` ⇄ `Weight 42.3 g`) and the low-stock line
   (`LOW STOCK Refill` ⇄ `Weight 8.4 g`), so the caregiver sees how much is left.
4. `TILTED! Upright` does **not** rotate: weighing is paused while tilted (the load cell reads garbage), and the warning matters more.
5. Dose-cycle screens (`Dispensing...`, `Take your pill`, …) are unchanged.

## Assumptions
- 3 s per screen is readable; the idle screen already redraws every 1 s, so no extra LCD writes.
- The value shown is the last 5 s reading (`updateStock()` cadence); no faster weighing — `get_units(5)` blocks ~0.5 s each time.
- All strings ≤ 16 chars, so nothing is cut off.

## Verification
- Compile with the IDE's `arduino-cli` (esp32:esp32:esp32).
- On the device (you, after flashing): row 2 alternates every 3 s; add/remove a pill and the grams change within ~5 s;
  tilt it and only `TILTED! Upright` shows.

✅ Completed — LCD row 2 alternates every 3 s with "Weight 42.3 g" (normal and low-stock lines; not while tilted). Firmware compiles; not flashed.
Revised after review: weight moved to row 1 next to humidity (`32C 52% 1000g`), clock to row 2 (`21:34 Next 22:43`); no rotation; stock % no longer on the LCD.
