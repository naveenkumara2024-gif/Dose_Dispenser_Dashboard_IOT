import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StockHistoryPoint } from "@/types";

// Sequential blue, single hue — this chart has exactly one series, so no legend is
// needed (the card title already says what compartment/medication this is).
const LINE_COLOR = "#2a78d6";
const GRIDLINE_COLOR = "#e1e0d9";
const AXIS_COLOR = "#898781";

function formatTick(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: StockHistoryPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload;
  return (
    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-foreground">{point.weight}g</p>
      <p className="text-muted-foreground">
        {new Date(point.timestamp).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}

export function StockChart({ history }: { history: StockHistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <p className="flex h-40 items-center justify-center text-xs text-muted-foreground">
        Not enough readings yet to chart a trend.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={history} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={GRIDLINE_COLOR} vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatTick}
          stroke={AXIS_COLOR}
          tick={{ fontSize: 11, fill: AXIS_COLOR }}
          axisLine={{ stroke: AXIS_COLOR }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          stroke={AXIS_COLOR}
          tick={{ fontSize: 11, fill: AXIS_COLOR }}
          axisLine={false}
          tickLine={false}
          width={36}
          unit="g"
        />
        <Tooltip content={<TooltipContent />} cursor={{ stroke: AXIS_COLOR }} />
        <Line
          type="monotone"
          dataKey="weight"
          stroke={LINE_COLOR}
          strokeWidth={2}
          dot={{ r: 4, fill: LINE_COLOR, stroke: "#fcfcfb", strokeWidth: 2 }}
          activeDot={{ r: 5, fill: LINE_COLOR, stroke: "#fcfcfb", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
