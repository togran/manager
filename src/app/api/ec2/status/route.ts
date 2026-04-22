import { NextRequest, NextResponse } from 'next/server';
import { DescribeInstanceStatusCommand } from "@aws-sdk/client-ec2";
import { createEc2Client } from "@/lib/aws";
import { requireSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get('instanceId');
  const region = searchParams.get('region');

  if (!instanceId) {
    return NextResponse.json({ status: null, error: 'instanceId required' });
  }

  try {
    const client = await createEc2Client(auth.session.role, region || undefined);
    const result = await client.send(
      new DescribeInstanceStatusCommand({
        InstanceIds: [instanceId],
        IncludeAllInstances: true,
      }),
    );
    const item = result.InstanceStatuses?.[0];

    if (!item) {
      return NextResponse.json({ status: null, error: null });
    }

    return NextResponse.json({
      status: {
        AvailabilityZone: item.AvailabilityZone,
        InstanceState: item.InstanceState?.Name,
        SystemStatus: item.SystemStatus?.Status,
        InstanceStatus: item.InstanceStatus?.Status,
        Events: (item.Events ?? []).map((e) => ({
          Code: e.Code,
          Description: e.Description,
          NotBefore: e.NotBefore?.toISOString(),
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