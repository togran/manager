import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from "fast-xml-parser";
import { signEc2Request } from '@/server/aws-sigv4';

const toArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get('instanceId');
  const region = searchParams.get('region');

  if (!instanceId) {
    return NextResponse.json({ status: null, error: 'instanceId required' });
  }

  // ✅ VALIDATE CREDENTIALS
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    console.error("❌ Missing AWS credentials in environment variables");
    return NextResponse.json(
      { status: null, error: "AWS credentials not configured" },
      { status: 500 }
    );
  }

  try {
    const signed = await signEc2Request(
      {
        Action: "DescribeInstanceStatus",
        Version: "2016-11-15",
        "InstanceId.1": instanceId,
        IncludeAllInstances: "true",
      },
      { region: region || undefined },
    );
    
    console.log(`📊 Fetching status for ${instanceId} in ${region}`);
    
    const res = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: signed.body,
    });
    
    const text = await res.text();
    
    if (!res.ok) {
      console.error(`❌ Status API error ${res.status}:`, text.slice(0, 300));
      return NextResponse.json(
        { status: null, error: `AWS error ${res.status}: ${text.slice(0, 200)}` },
        { status: res.status }
      );
    }
    
    const parser = new XMLParser({ ignoreAttributes: true });
    const obj = parser.parse(text);
    const item = toArray(obj?.DescribeInstanceStatusResponse?.instanceStatusSet?.item)[0];
    
    if (!item) {
      return NextResponse.json({ status: null, error: null });
    }
    
    console.log(`✅ Status retrieved for ${instanceId}`);
    
    return NextResponse.json({
      status: {
        AvailabilityZone: item.availabilityZone,
        InstanceState: item?.instanceState?.name,
        SystemStatus: item?.systemStatus?.status,
        InstanceStatus: item?.instanceStatus?.status,
        Events: toArray(item?.eventsSet?.item).map((e: any) => ({
          Code: e.code,
          Description: e.description,
          NotBefore: e.notBefore,
        })),
      },
      error: null,
    });
  } catch (e: any) {
    console.error(`❌ Status API failed:`, e.message);
    return NextResponse.json(
      { status: null, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}