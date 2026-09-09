import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAYS, type FieldErrors, type ScheduleFormValues } from "@/types";

const EMPTY: ScheduleFormValues = {
  name: "",
  dosage: "",
  compartmentNo: 1,
  time: "08:00",
  frequency: "daily",
  dayOfWeek: null,
};

type Props = {
  fieldErrors: FieldErrors;
  onSubmit: (values: ScheduleFormValues) => Promise<void>;
};

// Creates a brand-new medication + its first dose time. Editing an existing medication's
// name/dosage/compartment, or adding another time to one, are separate flows — see
// MedicationEditForm and TimeForm (prompt 12).
export function ScheduleForm({ fieldErrors, onSubmit }: Props) {
  const [values, setValues] = useState<ScheduleFormValues>(EMPTY);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(values);
      setValues(EMPTY);
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field: string) => fieldErrors[field]?.[0];

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-5">
      <div className="sm:col-span-2">
        <Label htmlFor="name">Medication</Label>
        <Input
          id="name"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          placeholder="e.g. Metformin"
        />
        {fieldError("name") && (
          <p className="mt-1 text-xs text-red-600">{fieldError("name")}</p>
        )}
      </div>

      <div>
        <Label htmlFor="dosage">Dosage</Label>
        <Input
          id="dosage"
          value={values.dosage}
          onChange={(e) => setValues({ ...values, dosage: e.target.value })}
          placeholder="500mg"
        />
        {fieldError("dosage") && (
          <p className="mt-1 text-xs text-red-600">{fieldError("dosage")}</p>
        )}
      </div>

      <div>
        <Label htmlFor="compartmentNo">Compartment</Label>
        <Input
          id="compartmentNo"
          type="number"
          min={0}
          value={values.compartmentNo}
          onChange={(e) =>
            setValues({ ...values, compartmentNo: Number(e.target.value) })
          }
        />
        {fieldError("compartmentNo") && (
          <p className="mt-1 text-xs text-red-600">
            {fieldError("compartmentNo")}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="time">Time</Label>
        <Input
          id="time"
          type="time"
          value={values.time}
          onChange={(e) => setValues({ ...values, time: e.target.value })}
        />
        {fieldError("time") && (
          <p className="mt-1 text-xs text-red-600">{fieldError("time")}</p>
        )}
      </div>

      <div>
        <Label htmlFor="frequency">Frequency</Label>
        <select
          id="frequency"
          value={values.frequency}
          onChange={(e) => {
            const frequency = e.target.value as ScheduleFormValues["frequency"];
            setValues({
              ...values,
              frequency,
              dayOfWeek:
                frequency === "weekly" ? (values.dayOfWeek ?? 1) : null,
            });
          }}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
        </select>
      </div>

      {values.frequency === "weekly" && (
        <div>
          <Label htmlFor="dayOfWeek">Day</Label>
          <select
            id="dayOfWeek"
            value={values.dayOfWeek ?? 1}
            onChange={(e) =>
              setValues({ ...values, dayOfWeek: Number(e.target.value) })
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
          {fieldError("dayOfWeek") && (
            <p className="mt-1 text-xs text-red-600">
              {fieldError("dayOfWeek")}
            </p>
          )}
        </div>
      )}

      <div className="flex items-end gap-2 sm:col-span-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Add medication"}
        </Button>
      </div>
    </form>
  );
}
