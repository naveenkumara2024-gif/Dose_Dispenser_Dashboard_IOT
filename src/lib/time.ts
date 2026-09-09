/**
 * All "what day is it / is this dose due" logic goes through here.
 *
 * The care location's timezone is what matters, not the server's — a server in UTC
 * evaluating an 08:00 dose for a patient in Asia/Kolkata would otherwise be 5.5 hours out
 * and could attribute a dose to the wrong day entirely.
 */

export const APP_TIMEZONE =
  process.env.APP_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hour12: false,
});

function partsInZone(instant: Date): DateParts {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((p) => [p.type, p.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // "24" appears at midnight under hour12:false in some environments.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday ?? "Sun"] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" as it reads at the care location right now. */
export function todayInZone(instant: Date = new Date()): string {
  const { year, month, day } = partsInZone(instant);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * 0 = Sunday .. 6 = Saturday for a "YYYY-MM-DD" calendar date.
 * Deliberately NOT zone-converted: the string is already a local calendar date, so
 * re-interpreting it in the zone shifts it a day either side of the offset.
 */
export function weekdayOfDate(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Minutes since local midnight right now — comparable with an "HH:mm" schedule. */
export function minutesSinceMidnightInZone(instant: Date = new Date()): number {
  const { hour, minute } = partsInZone(instant);
  return hour * 60 + minute;
}

/** Minutes since midnight for an "HH:mm" string, or null if unparseable. */
export function parseTimeToMinutes(time: string): number | null {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) {
    return null;
  }
  return h * 60 + m;
}

/** The zone's UTC offset in minutes at a given instant. */
function offsetMinutes(instant: Date): number {
  const { year, month, day, hour, minute } = partsInZone(instant);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Seconds/ms are dropped by the formatter, so compare on whole minutes.
  return (asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000;
}

/** UTC instants bounding a local calendar day, for timestamp range queries. */
export function zonedDayBounds(dateStr: string): { start: Date; end: Date } {
  const guess = new Date(`${dateStr}T12:00:00Z`);
  const offset = offsetMinutes(guess);

  const startUtcMs = Date.parse(`${dateStr}T00:00:00Z`) - offset * 60000;
  return {
    start: new Date(startUtcMs),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000 - 1),
  };
}

/** Shifts a "YYYY-MM-DD" by whole days. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days between two "YYYY-MM-DD" strings (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}
