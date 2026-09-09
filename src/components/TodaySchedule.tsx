import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DoseStatus, TodaysDose } from "@/types";

const STATUS_STYLES: Record<DoseStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-gray-100 text-gray-700" },
  DISPENSED: {
    label: "Dispensed, not confirmed",
    className: "bg-blue-100 text-blue-800",
  },
  CONFIRMED_TAKEN: { label: "Taken", className: "bg-green-100 text-green-800" },
  MISSED: { label: "Missed", className: "bg-red-100 text-red-800" },
};

export function TodaySchedule({ doses }: { doses: TodaysDose[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's schedule</CardTitle>
      </CardHeader>
      <CardContent>
        {doses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No medications scheduled yet.
          </p>
        ) : (
          <ul className="divide-y">
            {doses.map((dose) => {
              const status = STATUS_STYLES[dose.status];
              return (
                <li
                  key={dose.scheduleId}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-lg font-semibold">
                      {dose.time}
                    </span>
                    <div>
                      <p className="font-medium">{dose.medicationName}</p>
                      <p className="text-xs text-muted-foreground">
                        {dose.dosage} · compartment {dose.compartmentNo} ·{" "}
                        {dose.frequency}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
