import type { HistoryLog } from "@/types";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DISPENSED: {
    label: "Dispensed",
    className: "bg-blue-100 text-blue-800",
  },
  CONFIRMED_TAKEN: { label: "Taken", className: "bg-green-100 text-green-800" },
  MISSED: { label: "Missed", className: "bg-red-100 text-red-800" },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function DoseHistoryTable({ logs }: { logs: HistoryLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No dose events match these filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Medication</th>
            <th className="py-2 pr-4 font-medium">Dosage</th>
            <th className="py-2 pr-4 font-medium">Scheduled</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const status = STATUS_STYLES[log.status] ?? {
              label: log.status,
              className: "bg-gray-100 text-gray-700",
            };
            return (
              <tr key={log.id} className="border-b last:border-0">
                <td className="py-3 pr-4 whitespace-nowrap">
                  {formatTimestamp(log.timestamp)}
                </td>
                <td className="py-3 pr-4">{log.medicationName}</td>
                <td className="py-3 pr-4">{log.dosage}</td>
                <td className="py-3 pr-4 font-mono">{log.scheduledTime}</td>
                <td className="py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
