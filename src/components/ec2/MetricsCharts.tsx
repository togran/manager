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

function GraphTooltipCard({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const time = label;
  const value = payload[0]?.value;
  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-white p-3 shadow-lg min-w-[140px]">
      <div className="mb-1 text-xs font-semibold text-slate-500">Time</div>
      <div className="mb-2 text-sm font-mono text-[#111827]">{time}</div>
      <div className="mb-1 text-xs font-semibold text-slate-500">Value</div>
      <div className="text-base font-bold text-[#111827]">{value}</div>
    </div>
  );
}

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
  
  // Show dots when there are few data points
  const showDots = series.length <= 10;

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
              <XAxis 
                dataKey="time" 
                stroke="var(--color-muted-foreground)" 
                fontSize={11}
                angle={series.length > 8 ? -45 : 0}
                textAnchor={series.length > 8 ? "end" : "middle"}
                height={series.length > 8 ? 60 : 30}
              />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip content={<GraphTooltipCard />} cursor={{ fill: '#f3f4f6' }} />
              <Line
                type="linear"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2.5}
                dot={showDots ? { r: 4, fill: color } : false}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {series.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          {series.length} point{series.length !== 1 ? 's' : ''}
        </div>
      )}
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
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
        <p className="text-sm text-destructive">{data.error}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          💡 Tip: Make sure the instance has monitoring enabled and has been running for at least a few minutes.
        </p>
      </div>
    );
  }

  const noCPUData = !data?.cpu || data.cpu.length === 0;
  const noNetData = !data?.netIn || data.netIn.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {noCPUData ? (
        <div className="rounded-lg border border-border bg-panel p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h4 className="text-sm font-semibold text-foreground">CPU Utilization</h4>
            <span className="text-xs text-muted-foreground">Percent (avg)</span>
          </div>
          <div className="flex h-48 items-center justify-center">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">No CPU metrics available</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Enable detailed monitoring in EC2 console</p>
            </div>
          </div>
        </div>
      ) : (
        <Chart
          title="CPU Utilization"
          unit="Percent (avg)"
          data={data?.cpu ?? []}
          dataKey="Average"
          color="var(--color-aws-orange)"
        />
      )}
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