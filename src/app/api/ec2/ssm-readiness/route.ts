import { NextRequest, NextResponse } from "next/server";
import { DescribeInstanceInformationCommand } from "@aws-sdk/client-ssm";
import { createSsmClient } from "@/lib/aws";
import { requireSession } from "@/lib/auth";
import { getFriendlyAwsErrorMessage } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const region = searchParams.get("region");
  const iamRoleArn = searchParams.get("iamRoleArn");
  const instanceState = searchParams.get("instanceState");

  if (!instanceId) {
    return NextResponse.json({ error: "instanceId is required" }, { status: 400 });
  }

  const reasons: string[] = [];
  const hasIamRole = !!iamRoleArn;
  if (!hasIamRole) reasons.push("Missing IAM instance profile");

  const isRunning = instanceState?.toLowerCase() === "running";
  if (!isRunning) reasons.push("Instance is not in running state");

  // If foundational requirements are missing, skip SSM API call and return actionable blockers only.
  if (!hasIamRole || !isRunning) {
    return NextResponse.json({
      instanceId,
      region: region ?? null,
      canConnect: false,
      readiness: "Cannot connect",
      checks: {
        hasIamRole,
        isRunning,
        isManagedBySsm: false,
        pingStatus: "Unknown",
        platformType: null,
        lastPingDateTime: null,
      },
      reasons,
      error: null,
    });
  }

  try {
    const ssm = await createSsmClient(auth.session.role, region || undefined);
    const ssmInfo = await ssm.send(
      new DescribeInstanceInformationCommand({
        Filters: [
          { Key: "InstanceIds", Values: [instanceId] },
        ],
      }),
    );

    const managedNode = ssmInfo.InstanceInformationList?.[0];
    const pingStatus = managedNode?.PingStatus ?? "Offline";
    const isManaged = !!managedNode;
    const online = pingStatus === "Online";

    if (!isManaged) reasons.push("SSM Agent is not registered with Systems Manager");
    if (isManaged && !online) reasons.push(`SSM agent ping status: ${pingStatus}`);

    const canConnect = hasIamRole && isRunning && isManaged && online;

    return NextResponse.json({
      instanceId,
      region: region ?? null,
      canConnect,
      readiness: canConnect ? "Can connect" : "Cannot connect",
      checks: {
        hasIamRole,
        isRunning,
        isManagedBySsm: isManaged,
        pingStatus,
        platformType: managedNode?.PlatformType ?? null,
        lastPingDateTime: managedNode?.LastPingDateTime?.toISOString() ?? null,
      },
      reasons,
      error: null,
    });
  } catch (error: unknown) {
    const message = getFriendlyAwsErrorMessage(error, "Failed to check SSM readiness.");
    const rawMessage =
      error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const accessDenied = /accessdenied|not authorized|unauthorized/i.test(rawMessage);
    const finalReason = accessDenied
      ? "AWS credentials do not allow ssm:DescribeInstanceInformation."
      : message;
    return NextResponse.json(
      {
        instanceId,
        region: region ?? null,
        canConnect: false,
        readiness: "Cannot connect",
        checks: {
          hasIamRole,
          isRunning,
          isManagedBySsm: false,
          pingStatus: "Unknown",
          platformType: null,
          lastPingDateTime: null,
        },
        reasons: [...reasons, finalReason],
        error: finalReason,
      },
      { status: 200 },
    );
  }
}
