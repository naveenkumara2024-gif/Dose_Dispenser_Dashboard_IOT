type Props = {
  label: string;
  /** null = no reading yet. */
  value: number | null;
  unit: string;
  digits?: number;
  min: number;
  max: number;
  /** Safe band, drawn as a tinted arc on the track. */
  safe: { min: number; max: number };
  /** The reading is old (device offline / no recent data): drawn muted, not judged in/out of range. */
  stale?: boolean;
};

// 270-degree dial opening at the bottom, starting bottom-left and sweeping clockwise.
const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 78;
const STROKE = 14;
const SWEEP = 0.75;
const START_DEG = 135;
const CIRC = 2 * Math.PI * RADIUS;
const ARC = CIRC * SWEEP;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Circular gauge: value arc + knob over a track that shows the safe band. */
export function Gauge({ label, value, unit, digits = 0, min, max, safe, stale = false }: Props) {
  const frac = (n: number) => clamp01((n - min) / (max - min));
  const hasValue = value !== null;
  const outOfRange = hasValue && !stale && (value < safe.min || value > safe.max);
  const valueFrac = hasValue ? frac(value) : 0;
  const tone = stale
    ? "var(--muted-foreground)"
    : outOfRange
      ? "var(--brand-orange)"
      : "var(--brand-blue)";

  const safeStart = frac(safe.min);
  const safeLen = frac(safe.max) - safeStart;

  const ring = {
    cx: CENTER,
    cy: CENTER,
    r: RADIUS,
    fill: "none",
    strokeWidth: STROKE,
    transform: `rotate(${START_DEG} ${CENTER} ${CENTER})`,
  } as const;

  return (
    <div className="flex flex-col items-center" data-testid={`gauge-${label.toLowerCase()}`}>
      <div className="relative w-full max-w-[220px]">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full overflow-visible"
          role="img"
          aria-label={
            hasValue
              ? `${label} ${value.toFixed(digits)} ${unit}, ${outOfRange ? "out of range" : "in range"}`
              : `${label}: no reading`
          }
        >
          <circle
            {...ring}
            stroke="var(--muted)"
            strokeLinecap="round"
            strokeDasharray={`${ARC} ${CIRC}`}
          />
          <circle
            {...ring}
            stroke="var(--brand-blue-soft)"
            strokeDasharray={`${ARC * safeLen} ${CIRC}`}
            strokeDashoffset={-ARC * safeStart}
          />
          {hasValue && (
            <>
              <circle
                {...ring}
                stroke={tone}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(ARC * valueFrac, 0.01)} ${CIRC}`}
                style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.4s" }}
              />
              <g
                style={{
                  transform: `rotate(${START_DEG + 270 * valueFrac}deg)`,
                  transformOrigin: `${CENTER}px ${CENTER}px`,
                  transition: "transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <circle cx={CENTER + RADIUS} cy={CENTER} r={STROKE / 2 + 3} style={{ fill: "var(--card)" }} />
                <circle cx={CENTER + RADIUS} cy={CENTER} r={STROKE / 2 - 2} style={{ fill: tone }} />
              </g>
            </>
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pb-1">
          <span className="text-4xl font-light tracking-tight tabular-nums">
            {hasValue ? value.toFixed(digits) : "—"}
            <span className="ml-0.5 text-lg text-muted-foreground">{unit}</span>
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>

        <span className="absolute bottom-1 left-[10%] text-[11px] tabular-nums text-muted-foreground">
          {min}
        </span>
        <span className="absolute right-[10%] bottom-1 text-[11px] tabular-nums text-muted-foreground">
          {max}
        </span>
      </div>

      <p
        className={`-mt-1 rounded-full px-3 py-1 text-xs font-medium ${
          outOfRange
            ? "bg-brand-orange-soft text-brand-orange"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {!hasValue ? "No reading" : stale ? "Last reading" : outOfRange ? "Out of range" : "In range"}
        <span className="font-normal opacity-70">
          {" · "}
          {safe.min}–{safe.max}
          {unit}
        </span>
      </p>
    </div>
  );
}
