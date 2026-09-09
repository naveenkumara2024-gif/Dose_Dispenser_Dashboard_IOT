import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors, Medication, MedicationFormValues } from "@/types";

type Props = {
  medication: Medication;
  fieldErrors: FieldErrors;
  onSubmit: (values: MedicationFormValues) => Promise<void>;
  onCancel: () => void;
};

// Edits a medication's own fields. There's exactly one Medication row per drug, referenced
// by every one of its dose times, so this is the only place these fields are edited — no
// per-time duplicates to keep in sync (prompt 12).
export function MedicationEditForm({
  medication,
  fieldErrors,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<MedicationFormValues>({
    name: medication.name,
    dosage: medication.dosage,
    compartmentNo: medication.compartmentNo,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues({
      name: medication.name,
      dosage: medication.dosage,
      compartmentNo: medication.compartmentNo,
    });
  }, [medication]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field: string) => fieldErrors[field]?.[0];

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-4">
      <div>
        <Label htmlFor="med-name">Medication</Label>
        <Input
          id="med-name"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
        {fieldError("name") && (
          <p className="mt-1 text-xs text-red-600">{fieldError("name")}</p>
        )}
      </div>

      <div>
        <Label htmlFor="med-dosage">Dosage</Label>
        <Input
          id="med-dosage"
          value={values.dosage}
          onChange={(e) => setValues({ ...values, dosage: e.target.value })}
        />
        {fieldError("dosage") && (
          <p className="mt-1 text-xs text-red-600">{fieldError("dosage")}</p>
        )}
      </div>

      <div>
        <Label htmlFor="med-compartment">Compartment</Label>
        <Input
          id="med-compartment"
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

      <div className="flex items-end gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
