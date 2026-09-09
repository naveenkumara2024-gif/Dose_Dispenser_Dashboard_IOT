import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HistoryFilterState, ScheduleWithMedication } from "@/types";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

type Props = {
  value: HistoryFilterState;
  schedules: ScheduleWithMedication[];
  onChange: (next: HistoryFilterState) => void;
  onClear: () => void;
};

export function HistoryFilters({ value, schedules, onChange, onClear }: Props) {
  const medications = [
    ...new Map(
      schedules.map((s) => [s.medication.id, s.medication]),
    ).values(),
  ];

  const isFiltered =
    value.status !== "" ||
    value.medicationId !== "" ||
    value.from !== "" ||
    value.to !== "";

  return (
    <div className="grid gap-4 sm:grid-cols-5">
      <div>
        <Label htmlFor="filter-status">Status</Label>
        <select
          id="filter-status"
          className={SELECT_CLASS}
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value })}
        >
          <option value="">All statuses</option>
          <option value="DISPENSED">Dispensed</option>
          <option value="CONFIRMED_TAKEN">Taken</option>
          <option value="MISSED">Missed</option>
        </select>
      </div>

      <div>
        <Label htmlFor="filter-medication">Medication</Label>
        <select
          id="filter-medication"
          className={SELECT_CLASS}
          value={value.medicationId}
          onChange={(e) => onChange({ ...value, medicationId: e.target.value })}
        >
          <option value="">All medications</option>
          {medications.map((med) => (
            <option key={med.id} value={med.id}>
              {med.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="filter-from">From</Label>
        <Input
          id="filter-from"
          type="date"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="filter-to">To</Label>
        <Input
          id="filter-to"
          type="date"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </div>

      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          disabled={!isFiltered}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
