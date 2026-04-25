import { NextRequest, NextResponse } from "next/server";
import { DescribeInstanceStatusCommand, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { createEc2Client } from "@/lib/aws";
import { requireSession } from "@/lib/auth";
import { listInstanceActionLogs } from "@/lib/db";
import { getFriendlyAwsErrorMessage } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const region = searchParams.get("region");

  if (!instanceId) {
    return NextResponse.json({ error: "instanceId is required" }, { status: 400 });
  }

  try {
    const client = await createEc2Client(auth.session.role, region || undefined);
    const [instanceResult, statusResult] = await Promise.all([
      client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        }),
      ),
      client.send(
        new DescribeInstanceStatusCommand({
          InstanceIds: [instanceId],
          IncludeAllInstances: true,
        }),
      ),
    ]);

    const instance = instanceResult.Reservations?.[0]?.Instances?.[0];
    const status = statusResult.InstanceStatuses?.[0];
    const logs = listInstanceActionLogs(instanceId, region ?? undefined, 200);

    const launchTime = instance?.LaunchTime?.toISOString() ?? null;
    const currentState = instance?.State?.Name ?? null;

    const scheduledEvents = (status?.Events ?? []).map((item) => ({
      type: "scheduled-event",
      code: item.Code ?? null,
      description: item.Description ?? null,
      notBefore: item.NotBefore?.toISOString() ?? null,
      notAfter: item.NotAfter?.toISOString() ?? null,
      notBeforeDeadline: item.NotBeforeDeadline?.toISOString() ?? null,
    }));

    const actionHistory = logs.map((log) => ({
      id: log.id,
      type: "action",
      action: log.action,
      status: log.status,
      message: log.message,
      actorUsername: log.actorUsername,
      actorRole: log.actorRole,
      region: log.region,
      createdAt: log.createdAt,
      metadata: safeJsonParse(log.metadataJson),
    }));

    return NextResponse.json({
      instanceId,
      region: region ?? null,
      launchTime,
      currentState,
      statusChecks: {
        system: status?.SystemStatus?.Status ?? null,
        instance: status?.InstanceStatus?.Status ?? null,
      },
      scheduledEvents,
      actionHistory,
    });
  } catch (error: unknown) {
    const message = getFriendlyAwsErrorMessage(error, "Failed to load lifecycle timeline.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function safeJsonParse(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
