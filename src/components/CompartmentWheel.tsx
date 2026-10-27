import { useEffect, useState, type ReactNode } from "react";
import { COMPARTMENT_COUNT, type DashboardData, type TodaysDose } from "@/types";

export type SlotState =
  | "empty" // nothing loaded
  | "idle" // loaded, not due today (e.g. a weekly dose on another day)
  | "queued" // due today, waiting its turn
  | "next" // the compartment the wheel will drop from next
  | "dispensed" // dropped, waiting for the patient's confirmation
  | "taken"
  | "missed";

export type WheelSlot = {
  no: number;
  state: SlotState;
  time: string | null;
  title: string;
};

export const SLOT_LABEL: Record<SlotState, string> = {
  empty: "Empty",
  idle: "Loaded, not due today",
  queued: "Queued",
  next: "Next to drop",
  dispensed: "Dispensed, awaiting confirmation",
  taken: "Taken",
  missed: "Missed",
};

/** Folds the dashboard payload into one slot per compartment, plus the next dose to drop. */
export function buildWheel(data: DashboardData): {
  slots: WheelSlot[];
  next: TodaysDose | null;
} {
  const next =
    data.todaysDoses
      .filter((d) => d.status === "PENDING")
      .sort((a, b) => a.time.localeCompare(b.time))[0] ?? null;

  const slots = Array.from({ length: COMPARTMENT_COUNT }, (_, i): WheelSlot => {
    const no = i + 1;
    const loaded = data.compartments.find((c) => c.compartmentNo === no);
    if (!loaded) {
      return { no, state: "empty", time: null, title: `C${no} · empty` };
    }
    const dose = data.todaysDoses.find((d) => d.compartmentNo === no);
    let state: SlotState = "idle";
    if (dose) {
      state =
        dose.status === "PENDING"
          ? dose.scheduleId === next?.scheduleId
            ? "next"
            : "queued"
          : dose.status === "DISPENSED"
            ? "dispensed"
            : dose.status === "CONFIRMED_TAKEN"
              ? "taken"
              : "missed";
    }
    return {
      no,
      state,
      time: loaded.time,
      title: `C${no} · ${loaded.medicationName} ${loaded.dosage} · ${loaded.time} · ${SLOT_LABEL[state]}`,
    };
  });

  return { slots, next };
}

// --- geometry (viewBox 400 x 400, wheel centred) -------------------------------------
const C = 200;
const R_OUT = 172;
const R_IN = 106;
const R_MID = (R_OUT + R_IN) / 2;
const GAP_DEG = 3.5;
const ROUND = 5; // corner rounding: a same-colour stroke with round joins, radii inset to match

const rad = (deg: number) => (deg * Math.PI) / 180;
const xy = (r: number, deg: number): [number, number] => [
  C + r * Math.sin(rad(deg)),
  C - r * Math.cos(rad(deg)),
];
const pt = (r: number, deg: number) =>
  xy(r, deg)
    .map((v) => v.toFixed(2))
    .join(" ");

function wedgePath(centerDeg: number, halfSpan: number): string {
  const a0 = centerDeg - halfSpan;
  const a1 = centerDeg + halfSpan;
  const ro = R_OUT - ROUND / 2;
  const ri = R_IN + ROUND / 2;
  const large = halfSpan * 2 > 180 ? 1 : 0;
  return `M ${pt(ro, a0)} A ${ro} ${ro} 0 ${large} 1 ${pt(ro, a1)} L ${pt(ri, a1)} A ${ri} ${ri} 0 ${large} 0 ${pt(ri, a0)} Z`;
}

type Look = { paint: string; text: string };
const LOOK: Record<SlotState, Look> = {
  empty: { paint: "var(--slot-empty)", text: "var(--slot-empty-text)" },
  idle: { paint: "var(--slot-idle)", text: "var(--slot-idle-text)" },
  queued: { paint: "var(--brand-blue)", text: "white" },
  next: { paint: "var(--brand-orange)", text: "white" },
  dispensed: { paint: "var(--brand-blue-soft)", text: "var(--slot-dispensed-text)" },
  taken: { paint: "url(#wheel-hatch)", text: "var(--slot-taken-text)" },
  missed: { paint: "var(--brand-orange-soft)", text: "var(--slot-missed-text)" },
};

type Props = {
  slots: WheelSlot[];
  /** Hub content (the next drop). */
  children?: ReactNode;
};

/**
 * The dispenser wheel. The slot that drops next is turned to the fixed drop point at the
 * top; when the schedule changes the wheel spins - always the way the real one does - to the
 * new next compartment. Labels counter-rotate so they stay upright.
 */
export function CompartmentWheel({ slots, children }: Props) {
  const n = slots.length;
  const step = 360 / n;
  const nextIndex = slots.findIndex((s) => s.state === "next");
  const target = nextIndex === -1 ? null : -nextIndex * step;

  // Starts at 0 so the first render spins the wheel into place; then only ever turns forward.
  const [rot, setRot] = useState(0);
  useEffect(() => {
    if (target === null) return;
    setRot((prev) => prev - ((((prev - target) % 360) + 360) % 360));
  }, [target]);

  const spin = "transform 1.4s cubic-bezier(0.22, 1, 0.36, 1)";
  const showTime = n <= 8;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[380px]">
      <svg
        viewBox="0 0 400 400"
        className="absolute inset-0 size-full overflow-visible"
        role="img"
        aria-label={`Dispenser wheel with ${n} compartments`}
      >
        <defs>
          <radialGradient id="wheel-halo" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="var(--brand-blue)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--brand-blue)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wheel-drop-glow" cx="50%" cy="0%" r="60%">
            <stop offset="0%" stopColor="var(--brand-orange)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--brand-orange)" stopOpacity="0" />
          </radialGradient>
          <pattern
            id="wheel-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" style={{ fill: "var(--hatch-bg)" }} />
            <line x1="0" y1="0" x2="0" y2="6" strokeWidth="1.6" style={{ stroke: "var(--hatch-line)" }} />
          </pattern>
        </defs>

        <circle cx={C} cy={C} r={196} fill="url(#wheel-halo)" />
        {nextIndex !== -1 && (
          <ellipse cx={C} cy={34} rx={92} ry={64} fill="url(#wheel-drop-glow)" />
        )}

        <g
          data-testid="wheel-rotor"
          style={{
            transform: `rotate(${rot}deg)`,
            transformOrigin: `${C}px ${C}px`,
            transition: spin,
          }}
        >
          {slots.map((slot, i) => {
            const centerDeg = i * step;
            const look = LOOK[slot.state];
            const [lx, ly] = xy(R_MID, centerDeg);
            const path = wedgePath(centerDeg, step / 2 - GAP_DEG / 2);
            return (
              <g key={slot.no} data-slot={slot.no} data-state={slot.state}>
                <title>{slot.title}</title>
                <path
                  d={path}
                  style={{ fill: look.paint, stroke: look.paint }}
                  strokeWidth={ROUND}
                  strokeLinejoin="round"
                />
                {slot.state === "next" && (
                  <path
                    d={path}
                    fill="none"
                    stroke="var(--brand-orange)"
                    strokeWidth={ROUND + 7}
                    strokeLinejoin="round"
                    style={{ animation: "wheel-glow 2.2s ease-in-out infinite" }}
                  />
                )}
                <g
                  style={{
                    transform: `rotate(${-rot}deg)`,
                    transformOrigin: `${lx}px ${ly}px`,
                    transition: spin,
                  }}
                >
                  <text
                    x={lx}
                    y={showTime && slot.time ? ly - 4 : ly + 6}
                    textAnchor="middle"
                    fontSize={n > 8 ? 17 : 22}
                    fontWeight={500}
                    style={{ fill: look.text }}
                  >
                    C{slot.no}
                  </text>
                  {showTime && slot.time && (
                    <text
                      x={lx}
                      y={ly + 16}
                      textAnchor="middle"
                      fontSize={13}
                      opacity={0.85}
                      style={{ fill: look.text, fontVariantNumeric: "tabular-nums" }}
                    >
                      {slot.time}
                    </text>
                  )}
                  {slot.state === "taken" && (
                    <path
                      d={`M ${lx - 6} ${ly + 26} l 4.5 4.5 l 8 -9`}
                      fill="none"
                      strokeWidth={2}
                      style={{ stroke: "var(--slot-taken-text)" }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </g>
              </g>
            );
          })}
        </g>

        {/* Fixed drop point: the chute the pill falls through. */}
        <rect
          x={C - 7}
          y={3}
          width={14}
          height={27}
          rx={7}
          style={{ fill: "var(--foreground)" }}
        />
      </svg>

      <div className="absolute inset-[26%] flex flex-col items-center justify-center rounded-full bg-card text-center shadow-[0_6px_28px_rgba(20,30,80,0.1)] ring-1 ring-black/[0.04] dark:shadow-none dark:ring-white/[0.08]">
        {children}
      </div>
    </div>
  );
}
