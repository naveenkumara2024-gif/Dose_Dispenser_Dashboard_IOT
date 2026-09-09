import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  WEEKDAYS,
  type FieldErrors,
  type Medication,
  type ScheduleTimeFormValues,
  type ScheduleWithMedication,
} from "@/types";

const EMPTY: ScheduleTimeFormValues = {
  time: "08:00",
  frequency: "daily",
  dayOfWeek: null,
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

type Props = {
  medications: Medication[];
  editing: ScheduleWithMedication | null;
  fieldErrors: FieldErrors;
  onSubmit: (
    values: ScheduleTimeFormValues,
    medicationId: string | null,
  ) => Promise<void>;
  onCancel: () => void;
};

// Adds another dose time to an existing medication (medication picker + time fields), or
// edits one that already exists (time fields only — moving a time to a different medication
// isn't supported here; delete and re-add if that's genuinely needed). Never touches
// name/dosage/compartment — that's MedicationEditForm's job (prompt 12).
export function TimeForm({
  medications,
  editing,
  fieldErrors,
  onSubmit,
  onCancel,
}: Props) {
  const [medicationId, setMedicationId] = useState("");
  const [values, setValues] = useState<ScheduleTimeFormValues>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setValues({
        time: editing.time,
        frequency: editing.frequency === "weekly" ? "weekly" : "daily",
        dayOfWeek: editing.dayOfWeek,
      });
    } else {
      setValues(EMPTY);
      setMedicationId((id) => id || medications[0]?.id || "");
    }
  }, [editing, medications]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(values, editing ? null : medicationId);
      if (!editing) setValues(EMPTY);
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field: string) => fieldErrors[field]?.[0];

  if (!editing && medications.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a medication first, then you can give it additional dose times here.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-4">
      {!editing && (
        <div>
          <Label htmlFor="time-medication">Medication</Label>
          <select
            id="time-medication"
            className={SELECT_CLASS}
            value={medicationId}
            onChange={(e) => setMedicationId(e.target.value)}
          >
            {medications.map((med) => (
              <option key={med.id} value={med.id}>
                {med.name} ({med.dosage})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label htmlFor="time-value">Time</Label>
        <input
          id="time-value"
          type="time"
          value={values.time}
          onChange={(e) => setValues({ ...values, time: e.target.value })}
          className={SELECT_CLASS}
        />
        {fieldError("time") && (
          <p className="mt-1 text-xs text-red-600">{fieldError("time")}</p>
        )}
      </div>

      <div>
        <Label htmlFor="time-frequency">Frequency</Label>
        <select
          id="time-frequency"
          value={values.frequency}
          onChange={(e) => {
            const frequency = e.target
              .value as ScheduleTimeFormValues["frequency"];
            setValues({
              ...values,
              frequency,
              dayOfWeek:
                frequency === "weekly" ? (values.dayOfWeek ?? 1) : null,
            });
          }}
          className={SELECT_CLASS}
        >
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
        </select>
      </div>

      {values.frequency === "weekly" && (
        <div>
          <Label htmlFor="time-day">Day</Label>
          <select
            id="time-day"
            value={values.dayOfWeek ?? 1}
            onChange={(e) =>
              setValues({ ...values, dayOfWeek: Number(e.target.value) })
            }
            className={SELECT_CLASS}
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
          {saving ? "Saving…" : editing ? "Save changes" : "Add time"}
        </Button>
        {editing && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
