import { Button } from "@/components/ui/button";
import { WEEKDAYS, type Medication, type ScheduleWithMedication } from "@/types";

function describeFrequency(schedule: ScheduleWithMedication): string {
  if (schedule.frequency !== "weekly") return schedule.frequency;
  const day = schedule.dayOfWeek === null ? null : WEEKDAYS[schedule.dayOfWeek];
  return day ? `weekly · ${day.slice(0, 3)}` : "weekly";
}

type Props = {
  schedules: ScheduleWithMedication[];
  onEditTime: (schedule: ScheduleWithMedication) => void;
  onDeleteTime: (schedule: ScheduleWithMedication) => void;
  onEditMedication: (medication: Medication) => void;
};

// Grouped by medication: one header row (name/dosage/compartment + Edit) with each of its
// dose times listed underneath. A medication with several times shows as one group, not
// several look-alike rows — that grouping is what makes "one medication, one edit path"
// visible in the UI, not just true in the database (prompt 12).
export function ScheduleTable({
  schedules,
  onEditTime,
  onDeleteTime,
  onEditMedication,
}: Props) {
  if (schedules.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No medications yet. Add one using the form above.
      </p>
    );
  }

  const groups = new Map<string, ScheduleWithMedication[]>();
  for (const schedule of schedules) {
    const key = schedule.medicationId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(schedule);
  }

  return (
    <div className="space-y-6">
      {[...groups.values()].map((times) => {
        const medication = times[0]!.medication;
        return (
          <div key={medication.id} className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
              <div>
                <span className="font-medium">{medication.name}</span>{" "}
                <span className="text-sm text-muted-foreground">
                  {medication.dosage} · compartment {medication.compartmentNo}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditMedication(medication)}
              >
                Edit
              </Button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {times.map((schedule) => (
                  <tr key={schedule.id} className="border-b last:border-0">
                    <td className="w-24 py-2 pl-4 font-mono font-medium">
                      {schedule.time}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {describeFrequency(schedule)}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEditTime(schedule)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteTime(schedule)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
