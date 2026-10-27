import { Label } from "@/components/ui/label";
import { COMPARTMENT_COUNT, type ScheduleWithMedication } from "@/types";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

type Props = {
  idPrefix: string;
  schedules: ScheduleWithMedication[]; // active dose times (GET /api/schedule)
  excludeId?: string; // the dose time being edited
  compartmentNo: number;
  time: string;
  endDate: string | null;
  errors: { compartmentNo?: string; endDate?: string };
  onChange: (next: { compartmentNo?: number; endDate?: string | null }) => void;
};

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Compartment picker + optional end date for one dose time. Mirrors the server's rules
// (src/lib/compartments.ts) so the caregiver sees them before saving: one dose per
// compartment, and times increasing C1 -> C5 because the wheel only turns one way.
// The server still enforces both; this is guidance, not the guard.
export function CompartmentFields({
  idPrefix,
  schedules,
  excludeId,
  compartmentNo,
  time,
  endDate,
  errors,
  onChange,
}: Props) {
  const others = schedules.filter((s) => s.id !== excludeId);
  const holderOf = (n: number) => others.find((s) => s.compartmentNo === n);

  const before = others
    .filter((s) => s.compartmentNo < compartmentNo)
    .sort((a, b) => b.compartmentNo - a.compartmentNo)[0];
  const after = others
    .filter((s) => s.compartmentNo > compartmentNo)
    .sort((a, b) => a.compartmentNo - b.compartmentNo)[0];

  const bounds = [
    before && `after ${before.time} (C${before.compartmentNo})`,
    after && `before ${after.time} (C${after.compartmentNo})`,
  ].filter(Boolean);
  const outOfOrder =
    (before && time <= before.time) || (after && time >= after.time);

  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-compartment`}>Compartment</Label>
        <select
          id={`${idPrefix}-compartment`}
          className={SELECT_CLASS}
          value={compartmentNo}
          onChange={(e) => onChange({ compartmentNo: Number(e.target.value) })}
        >
          {Array.from({ length: COMPARTMENT_COUNT }, (_, i) => i + 1).map((n) => {
            const holder = holderOf(n);
            return (
              <option key={n} value={n} disabled={Boolean(holder)}>
                {holder
                  ? `C${n} - ${holder.medication.name} ${holder.time}`
                  : `C${n} - empty`}
              </option>
            );
          })}
        </select>
        {errors.compartmentNo ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.compartmentNo}</p>
        ) : bounds.length > 0 ? (
          <p
            className={`mt-1 text-xs ${outOfOrder ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
          >
            Time must be {bounds.join(" and ")}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-until`}>Until (optional)</Label>
        <input
          id={`${idPrefix}-until`}
          type="date"
          min={localToday()}
          value={endDate ?? ""}
          onChange={(e) => onChange({ endDate: e.target.value || null })}
          className={SELECT_CLASS}
        />
        {errors.endDate && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.endDate}</p>
        )}
      </div>
    </>
  );
}

/** First compartment with no active dose, or 1 if all are taken. */
export function firstFreeCompartment(
  schedules: ScheduleWithMedication[],
  excludeId?: string,
): number {
  for (let n = 1; n <= COMPARTMENT_COUNT; n++) {
    if (!schedules.some((s) => s.id !== excludeId && s.compartmentNo === n)) return n;
  }
  return 1;
}
