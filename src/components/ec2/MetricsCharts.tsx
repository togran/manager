"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export interface MetricPoint {
  Timestamp: string;
  Average: number;
  Sum: number;
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function bytesToMB(b: number) {
  return +(b / (1024 * 1024)).toFixed(2);
}

function Chart({
  title,
  unit,
  data,
  dataKey,
  color,
  formatter,
}: {
  title: string;
  unit: string;
  data: MetricPoint[];
  dataKey: "Average" | "value";
  color: string;
  formatter?: (v: number) => number;
}) {
  const series = data.map((p) => ({
    time: formatTime(p.Timestamp),
    Average: p.Average,
    value: formatter ? formatter(p.Sum) : p.Sum,
  }));
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <div className="h-48 w-full">
        {series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No data points returned by CloudWatch.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="time" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function MetricsCharts({ instanceId, region }: { instanceId: string; region: string | null }) {
  const { data, isLoading, error } = useQuery<{
    cpu: MetricPoint[];
    netIn: MetricPoint[];
    netOut: MetricPoint[];
    error: string | null;
  }>({
    queryKey: ["ec2-metrics", instanceId, region],
    queryFn: () =>
      fetch(`/api/ec2/metrics?instanceId=${encodeURIComponent(instanceId)}&region=${encodeURIComponent(
        region ?? '',
      )}`).then((res) => res.json()),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading CloudWatch metrics…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  }
  if (data?.error) {
    return <p className="text-sm text-destructive">{data.error}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Chart
        title="CPU Utilization"
        unit="Percent (avg)"
        data={data?.cpu ?? []}
        dataKey="Average"
        color="var(--color-aws-orange)"
      />
      <Chart
        title="Network In"
        unit="MB / 5 min"
        data={data?.netIn ?? []}
        dataKey="value"
        color="oklch(0.62 0.17 230)"
        formatter={bytesToMB}
      />
      <Chart
        title="Network Out"
        unit="MB / 5 min"
        data={data?.netOut ?? []}
        dataKey="value"
        color="oklch(0.62 0.17 150)"
        formatter={bytesToMB}
      />
    </div>
  );
}