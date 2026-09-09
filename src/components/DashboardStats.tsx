import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/types";

type Props = {
  adherence: DashboardData["adherence"];
  device: DashboardData["device"];
  dosesToday: number;
  alertCount: number;
};

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "No heartbeat received yet";
  return `Last seen ${new Date(lastSeenAt).toLocaleTimeString()}`;
}

export function DashboardStats({
  adherence,
  device,
  dosesToday,
  alertCount,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Adherence ({adherence.windowDays}d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">
            {adherence.pct === null ? "—" : `${adherence.pct}%`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {adherence.confirmed} of {adherence.dispensed} dispensed doses
            confirmed
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Doses today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{dosesToday}</p>
          <p className="mt-1 text-xs text-muted-foreground">scheduled</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Active alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{alertCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">unresolved</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Device
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-center gap-2 text-3xl font-semibold">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                device.online ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            {device.online ? "Online" : "Offline"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatLastSeen(device.lastSeenAt)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
