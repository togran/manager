import { NextRequest, NextResponse } from "next/server";
import {
  RebootInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { createEc2Client } from "@/lib/aws";
import { requireSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (auth.error) return auth.error;

  try {
    const { action, instanceId, region } = (await request.json()) as {
      action?: "start" | "stop" | "reboot" | "terminate";
      instanceId?: string;
      region?: string;
    };

    if (!action || !instanceId) {
      return NextResponse.json({ error: "action and instanceId are required" }, { status: 400 });
    }

    const client = await createEc2Client(auth.session.role, region || undefined);
    if (action === "start") {
      await client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
    } else if (action === "stop") {
      await client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
    } else if (action === "reboot") {
      await client.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }));
    } else if (action === "terminate") {
      await client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Action failed" },
      { status: 500 },
    );
  }
}
