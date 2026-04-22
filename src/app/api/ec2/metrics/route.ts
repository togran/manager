import { NextRequest, NextResponse } from 'next/server';
import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { createCloudWatchClient } from "@/lib/aws";
import { requireSession } from "@/lib/auth";

interface MetricPoint {
  Timestamp: string;
  Average: number;
  Sum: number;
}

async function getMetric(
  role: "admin" | "user",
  region: string,
  instanceId: string,
  metricName: string,
  statistic: 'Average' | 'Sum',
): Promise<MetricPoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 60 * 60 * 1000); // last 3h
  const client = await createCloudWatchClient(role, region);
  const result = await client.send(
    new GetMetricStatisticsCommand({
      Namespace: "AWS/EC2",
      MetricName: metricName,
      StartTime: start,
      EndTime: end,
      Period: 300,
      Statistics: [statistic],
      Dimensions: [{ Name: "InstanceId", Value: instanceId }],
    }),
  );

  return (result.Datapoints ?? [])
    .map((p) => ({
      Timestamp: p.Timestamp?.toISOString() ?? "",
      Average: Number(p.Average ?? 0),
      Sum: Number(p.Sum ?? 0),
    }))
    .sort((a, b) => a.Timestamp.localeCompare(b.Timestamp));
}

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get('instanceId');
  const region = searchParams.get('region');

  if (!instanceId) {
    return NextResponse.json({ cpu: [], netIn: [], netOut: [], error: 'instanceId is required' });
  }

  const finalRegion = region || process.env.AWS_REGION;
  if (!finalRegion) {
    return NextResponse.json({ cpu: [], netIn: [], netOut: [], error: 'AWS_REGION not configured' });
  }

  console.log(`📊 Fetching metrics for ${instanceId} in ${finalRegion}`);

  try {
    const [cpu, netIn, netOut] = await Promise.all([
      getMetric(auth.session.role, finalRegion, instanceId, 'CPUUtilization', 'Average').catch((e) => {
        console.error(`❌ CPUUtilization failed:`, e.message);
        return [];
      }),
      getMetric(auth.session.role, finalRegion, instanceId, 'NetworkIn', 'Sum').catch((e) => {
        console.error(`❌ NetworkIn failed:`, e.message);
        return [];
      }),
      getMetric(auth.session.role, finalRegion, instanceId, 'NetworkOut', 'Sum').catch((e) => {
        console.error(`❌ NetworkOut failed:`, e.message);
        return [];
      }),
    ]);
    
    console.log(`✅ Metrics collected: CPU=${cpu.length}, NetIn=${netIn.length}, NetOut=${netOut.length}`);
    
    return NextResponse.json({ cpu, netIn, netOut, error: null });
  } catch (e: any) {
    console.error('❌ getInstanceMetrics failed:', e);
    return NextResponse.json({
      cpu: [] as MetricPoint[],
      netIn: [] as MetricPoint[],
      netOut: [] as MetricPoint[],
      error: e?.message ?? 'Unknown error',
    });
  }
}
