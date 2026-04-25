import { NextRequest, NextResponse } from "next/server";
import {
  RebootInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { createEc2Client } from "@/lib/aws";
import { requireSession } from "@/lib/auth";
import { createInstanceActionLog } from "@/lib/db";
import { getFriendlyAwsErrorMessage } from "@/lib/errors";

export async function POST(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (auth.error) return auth.error;
  let requestBody:
    | {
        action?: "start" | "stop" | "reboot" | "terminate";
        instanceId?: string;
        instanceIds?: string[];
        region?: string;
      }
    | null = null;

  try {
    requestBody = (await request.json()) as {
      action?: "start" | "stop" | "reboot" | "terminate";
      instanceId?: string;
      instanceIds?: string[];
      region?: string;
    };
    const { action, instanceId, instanceIds, region } = requestBody;

    const targetInstanceIds = Array.from(
      new Set(
        (
          Array.isArray(instanceIds) && instanceIds.length > 0
            ? instanceIds
            : instanceId
              ? [instanceId]
              : []
        ).filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      ),
    );

    if (!action || targetInstanceIds.length === 0) {
      return NextResponse.json({ error: "action and at least one instance id are required" }, { status: 400 });
    }

    const metadataJson = JSON.stringify({ action, targetCount: targetInstanceIds.length });
    targetInstanceIds.forEach((id) => {
      createInstanceActionLog({
        instanceId: id,
        region: region ?? null,
        action,
        actorUserId: auth.session.id,
        actorUsername: auth.session.username,
        actorRole: auth.session.role,
        status: "requested",
        metadataJson,
      });
    });

    const client = await createEc2Client(auth.session.role, region || undefined);
    if (action === "start") {
      await client.send(new StartInstancesCommand({ InstanceIds: targetInstanceIds }));
    } else if (action === "stop") {
      await client.send(new StopInstancesCommand({ InstanceIds: targetInstanceIds }));
    } else if (action === "reboot") {
      await client.send(new RebootInstancesCommand({ InstanceIds: targetInstanceIds }));
    } else if (action === "terminate") {
      await client.send(new TerminateInstancesCommand({ InstanceIds: targetInstanceIds }));
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    targetInstanceIds.forEach((id) => {
      createInstanceActionLog({
        instanceId: id,
        region: region ?? null,
        action,
        actorUserId: auth.session.id,
        actorUsername: auth.session.username,
        actorRole: auth.session.role,
        status: "success",
        message: `EC2 ${action} request submitted`,
        metadataJson,
      });
    });

    return NextResponse.json({ ok: true, count: targetInstanceIds.length });
  } catch (error: unknown) {
    const message = getFriendlyAwsErrorMessage(error, "Failed to run EC2 action.");
    if (requestBody) {
      const body = requestBody;
      const ids = Array.from(
        new Set(
          (
            Array.isArray(body.instanceIds) && body.instanceIds.length > 0
              ? body.instanceIds
              : body.instanceId
                ? [body.instanceId]
                : []
          ).filter((value): value is string => typeof value === "string" && value.trim().length > 0),
        ),
      );
      ids.forEach((id) => {
        createInstanceActionLog({
          instanceId: id,
          region: body.region ?? null,
          action: body.action ?? "unknown",
          actorUserId: auth.session.id,
          actorUsername: auth.session.username,
          actorRole: auth.session.role,
          status: "failed",
          message,
        });
      });
    }
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
