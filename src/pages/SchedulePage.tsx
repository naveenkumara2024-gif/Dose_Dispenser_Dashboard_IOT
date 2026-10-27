import { useCallback, useEffect, useState } from "react";
import { MedicationEditForm } from "@/components/MedicationEditForm";
import { ScheduleForm } from "@/components/ScheduleForm";
import { ScheduleTable } from "@/components/ScheduleTable";
import { TimeForm } from "@/components/TimeForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveRefresh } from "@/lib/live";
import type {
  FieldErrors,
  Medication,
  MedicationFormValues,
  ScheduleFormValues,
  ScheduleTimeFormValues,
  ScheduleWithMedication,
} from "@/types";

export function SchedulePage() {
  const [schedules, setSchedules] = useState<ScheduleWithMedication[] | null>(
    null,
  );
  const [medications, setMedications] = useState<Medication[]>([]);
  const [editingTime, setEditingTime] = useState<ScheduleWithMedication | null>(
    null,
  );
  const [editingMedication, setEditingMedication] = useState<Medication | null>(
    null,
  );
  const [newMedicationErrors, setNewMedicationErrors] = useState<FieldErrors>(
    {},
  );
  const [timeErrors, setTimeErrors] = useState<FieldErrors>({});
  const [medicationErrors, setMedicationErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [scheduleRes, medicationRes] = await Promise.all([
      fetch("/api/schedule"),
      fetch("/api/medications"),
    ]);
    setSchedules((await scheduleRes.json()) as ScheduleWithMedication[]);
    setMedications((await medicationRes.json()) as Medication[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  // Another tab or the monitor job (end dates, weekly doses) changed the schedule.
  useLiveRefresh(["schedule"], load);

  // 400 = field errors, 409 = a compartment rule (occupied / out of order, prompt 15).
  // Returns true when the save went through.
  const handleSaveResponse = async (
    res: Response,
    setErrors: (errors: FieldErrors) => void,
  ): Promise<boolean> => {
    if (res.status === 400) {
      const body = (await res.json()) as { error: { fieldErrors: FieldErrors } };
      setErrors(body.error.fieldErrors);
      return false;
    }
    if (res.status === 409) {
      const body = (await res.json()) as { error: string };
      setMessage(body.error);
      return false;
    }
    if (!res.ok) {
      setMessage("Something went wrong. Please try again.");
      return false;
    }
    return true;
  };

  const handleCreateMedication = async (values: ScheduleFormValues) => {
    setNewMedicationErrors({});
    setMessage(null);

    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!(await handleSaveResponse(res, setNewMedicationErrors))) return false;
    await load();
    return true;
  };

  const handleSubmitTime = async (
    values: ScheduleTimeFormValues,
    medicationId: string | null,
  ) => {
    setTimeErrors({});
    setMessage(null);

    const url = editingTime
      ? `/api/schedule/${editingTime.id}`
      : `/api/medications/${medicationId}/schedules`;

    const res = await fetch(url, {
      method: editingTime ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!(await handleSaveResponse(res, setTimeErrors))) return false;
    setEditingTime(null);
    await load();
    return true;
  };

  const handleSubmitMedication = async (values: MedicationFormValues) => {
    if (!editingMedication) return;
    setMedicationErrors({});
    setMessage(null);

    const res = await fetch(`/api/medications/${editingMedication.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (res.status === 400) {
      const body = (await res.json()) as { error: { fieldErrors: FieldErrors } };
      setMedicationErrors(body.error.fieldErrors);
      return;
    }
    if (!res.ok) {
      setMessage("Something went wrong. Please try again.");
      return;
    }

    setEditingMedication(null);
    await load();
  };

  const handleDeleteTime = async (schedule: ScheduleWithMedication) => {
    if (
      !confirm(`Delete ${schedule.medication.name} at ${schedule.time}?`)
    ) {
      return;
    }
    setMessage(null);

    const res = await fetch(`/api/schedule/${schedule.id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const body = (await res.json()) as { error: string };
      setMessage(body.error);
      return;
    }

    if (editingTime?.id === schedule.id) setEditingTime(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Schedule</h2>
        <p className="text-sm text-muted-foreground">
          Medications and the times they're dispensed.
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-300">
          {message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a medication</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleForm
            schedules={schedules ?? []}
            fieldErrors={newMedicationErrors}
            onSubmit={handleCreateMedication}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {editingTime ? "Edit dose time" : "Add a dose time"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TimeForm
            medications={medications}
            schedules={schedules ?? []}
            editing={editingTime}
            fieldErrors={timeErrors}
            onSubmit={handleSubmitTime}
            onCancel={() => {
              setEditingTime(null);
              setTimeErrors({});
            }}
          />
        </CardContent>
      </Card>

      {editingMedication && (
        <Card>
          <CardHeader>
            <CardTitle>Edit medication</CardTitle>
          </CardHeader>
          <CardContent>
            <MedicationEditForm
              medication={editingMedication}
              fieldErrors={medicationErrors}
              onSubmit={handleSubmitMedication}
              onCancel={() => {
                setEditingMedication(null);
                setMedicationErrors({});
              }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {schedules === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ScheduleTable
              schedules={schedules}
              onEditTime={(schedule) => {
                setEditingTime(schedule);
                setTimeErrors({});
              }}
              onDeleteTime={handleDeleteTime}
              onEditMedication={(medication) => {
                setEditingMedication(medication);
                setMedicationErrors({});
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
