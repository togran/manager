import { XMLParser } from "fast-xml-parser";
import { signEc2Request } from "./aws-sigv4";

const toArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

export interface MetricPoint {
  Timestamp: string;
  Average: number;
  Sum: number;
}

async function getMetric(
  region: string,
  instanceId: string,
  metricName: string,
  statistic: "Average" | "Sum",
): Promise<MetricPoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 60 * 60 * 1000); // last 3h
  const params: Record<string, string> = {
    Action: "GetMetricStatistics",
    Version: "2010-08-01",
    Namespace: "AWS/EC2",
    MetricName: metricName,
    StartTime: start.toISOString(),
    EndTime: end.toISOString(),
    Period: "300",
    "Statistics.member.1": statistic,
    "Dimensions.member.1.Name": "InstanceId",
    "Dimensions.member.1.Value": instanceId,
  };
  const signed = await signEc2Request(params, { service: "monitoring", region });
  const res = await fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    body: signed.body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CloudWatch ${metricName} ${res.status}: ${text.slice(0, 200)}`);
  const parser = new XMLParser({ ignoreAttributes: true });
  const obj = parser.parse(text);
  const points = toArray(
    obj?.GetMetricStatisticsResponse?.GetMetricStatisticsResult?.Datapoints?.member,
  )
    .map((p: any) => ({
      Timestamp: String(p.Timestamp),
      Average: Number(p.Average ?? 0),
      Sum: Number(p.Sum ?? 0),
    }))
    .sort((a, b) => a.Timestamp.localeCompare(b.Timestamp));
  return points;
}

export async function getInstanceMetrics(data: { instanceId: string; region?: string }) {
  const region = data.region || process.env.AWS_REGION;
  if (!region) return { cpu: [], netIn: [], netOut: [], error: "AWS_REGION not configured" };
  try {
    const [cpu, netIn, netOut] = await Promise.all([
      getMetric(region, data.instanceId, "CPUUtilization", "Average"),
      getMetric(region, data.instanceId, "NetworkIn", "Sum"),
      getMetric(region, data.instanceId, "NetworkOut", "Sum"),
    ]);
    return { cpu, netIn, netOut, error: null as string | null };
  } catch (e: any) {
    console.error("getInstanceMetrics failed:", e);
    return {
      cpu: [] as MetricPoint[],
      netIn: [] as MetricPoint[],
      netOut: [] as MetricPoint[],
      error: e?.message ?? "Unknown error",
    };
  }
}