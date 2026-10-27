// Shared sensor thresholds, used by both the firmware endpoints (to raise alerts) and
// GET /api/sensors (to grade status and draw the safe band on the chart) — prompt 16.

// Placeholder storage limits — not sourced from real medication storage requirements.
export const SAFE_TEMPERATURE_C = { min: 15, max: 35 };
export const SAFE_HUMIDITY_PCT = { min: 30, max: 70 };

// Same placeholder as the stock page (prompt 13) — only used when the device hasn't
// sent a % of full (not calibrated, or the reading came via /api/stock-alert).
export const LOW_STOCK_THRESHOLD_G = 2;

// Matches the firmware's LOW_STOCK_PCT, so the dashboard and device agree (prompt 19).
export const LOW_STOCK_PCT = 20;

export function isLowStock(weight: number, percent: number | null): boolean {
  return percent !== null ? percent < LOW_STOCK_PCT : weight < LOW_STOCK_THRESHOLD_G;
}

// DS3231 vs server clock; beyond this the RTC card asks for attention (dose times rely on it).
export const RTC_DRIFT_WARN_S = 120;

// A sensor with no reading for this long is shown as "stale" rather than trusted.
export const STALE_AFTER_MS = 15 * 60 * 1000;

export function isEnvironmentOutOfRange(temperature: number, humidity: number): boolean {
  return (
    temperature < SAFE_TEMPERATURE_C.min ||
    temperature > SAFE_TEMPERATURE_C.max ||
    humidity < SAFE_HUMIDITY_PCT.min ||
    humidity > SAFE_HUMIDITY_PCT.max
  );
}
