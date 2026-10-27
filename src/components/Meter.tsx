import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  /** 0-100, or null when there's nothing to measure yet. */
  pct: number | null;
  tone: "blue" | "orange";
  footLeft: { value: ReactNode; label: string };
  footRight: { value: ReactNode; label: string };
};

const FILL = {
  blue: "linear-gradient(90deg, var(--brand-blue) 0%, var(--brand-blue-soft) 100%)",
  orange: "linear-gradient(90deg, var(--brand-orange) 0%, var(--brand-orange-soft) 100%)",
};

const HATCH =
  "repeating-linear-gradient(135deg, var(--hatch-line) 0 1px, transparent 1px 5px)";

/** Gradient progress bar with a hatched remainder and a tick at the boundary. */
export function Meter({ label, value, pct, tone, footLeft, footRight }: Props) {
  const width = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full min-w-[240px] sm:w-72">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-3xl font-light tracking-tight tabular-nums">{value}</span>
      </div>
      <div
        className="relative mt-2 h-9 overflow-hidden rounded-[3px]"
        style={{ backgroundImage: HATCH }}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
          style={{ width: `${width}%`, backgroundImage: FILL[tone] }}
        />
        {pct !== null && (
          <div
            className="absolute top-0 h-3 w-0.5 -translate-x-1/2 bg-foreground transition-[left] duration-700 ease-out"
            style={{ left: `${width}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex items-end justify-between text-xs text-muted-foreground">
        <span>
          <span className="block text-lg font-light text-foreground tabular-nums">
            {footLeft.value}
          </span>
          {footLeft.label}
        </span>
        <span className="text-right">
          <span className="block text-lg font-light text-foreground tabular-nums">
            {footRight.value}
          </span>
          {footRight.label}
        </span>
      </div>
    </div>
  );
}
