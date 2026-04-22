import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import { signEc2Request } from '@/server/aws-sigv4';

const toArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

interface MetricPoint {
  Timestamp: string;
  Average: number;
  Sum: number;
}

async function getMetric(
  region: string,
  instanceId: string,
  metricName: string,
  statistic: 'Average' | 'Sum',
): Promise<MetricPoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 60 * 60 * 1000); // last 3h
  const params: Record<string, string> = {
    Action: 'GetMetricStatistics',
    Version: '2010-08-01',
    Namespace: 'AWS/EC2',
    MetricName: metricName,
    StartTime: start.toISOString(),
    EndTime: end.toISOString(),
    Period: '300',
    'Statistics.member.1': statistic,
    'Dimensions.member.1.Name': 'InstanceId',
    'Dimensions.member.1.Value': instanceId,
  };

  try {
    const signed = await signEc2Request(params, { service: 'monitoring', region });
    const res = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: signed.body,
    });
    const text = await res.text();
    
    if (!res.ok) {
      console.error(`❌ CloudWatch ${metricName} error:`, text.slice(0, 500));
      throw new Error(`CloudWatch ${metricName} ${res.status}: ${text.slice(0, 200)}`);
    }
    
    const parser = new XMLParser({ ignoreAttributes: true });
    const obj = parser.parse(text);
    const datapoints = toArray(obj?.GetMetricStatisticsResponse?.GetMetricStatisticsResult?.Datapoints?.member);
    
    console.log(`✅ ${metricName}: ${datapoints.length} datapoints from CloudWatch`);
    
    return datapoints
      .map((p: any) => ({
        Timestamp: String(p.Timestamp),
        Average: Number(p.Average ?? 0),
        Sum: Number(p.Sum ?? 0),
      }))
      .sort((a, b) => a.Timestamp.localeCompare(b.Timestamp));
  } catch (err: any) {
    console.error(`❌ getMetric(${metricName}) failed:`, err.message);
    throw err;
  }
}

export async function GET(request: NextRequest) {
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
      getMetric(finalRegion, instanceId, 'CPUUtilization', 'Average').catch((e) => {
        console.error(`❌ CPUUtilization failed:`, e.message);
        return [];
      }),
      getMetric(finalRegion, instanceId, 'NetworkIn', 'Sum').catch((e) => {
        console.error(`❌ NetworkIn failed:`, e.message);
        return [];
      }),
      getMetric(finalRegion, instanceId, 'NetworkOut', 'Sum').catch((e) => {
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
