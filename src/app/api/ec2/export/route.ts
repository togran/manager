import { NextRequest, NextResponse } from "next/server";
import { DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import type { Instance } from "@aws-sdk/client-ec2";
import { createEc2Client } from "@/lib/aws";
import { requireSession } from "@/lib/auth";
import { getFriendlyAwsErrorMessage } from "@/lib/errors";

type ExportRow = {
  InstanceId: string;
  Name: string;
  State: string;
  InstanceType: string;
  AvailabilityZone: string;
  Region: string;
  PrivateIpAddress: string;
  PublicIpAddress: string;
  LaunchTime: string;
  VpcId: string;
  SubnetId: string;
  SecurityGroups: string;
  Tags: string;
  SecurityPosture: string;
};

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region") || process.env.AWS_REGION || "ap-south-1";
    const format = (searchParams.get("format") || "json").toLowerCase();
    const state = (searchParams.get("state") || "all").toLowerCase();
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    if (!["json", "csv"].includes(format)) {
      return NextResponse.json({ error: "format must be json or csv" }, { status: 400 });
    }

    const client = await createEc2Client(auth.session.role, region);
    const response = await client.send(new DescribeInstancesCommand({}));

    const instances = flattenInstances(response.Reservations ?? []);
    const filtered = instances.filter((item) => {
      const statePass = state === "all" || item.State.toLowerCase() === state;
      const searchPass =
        !search ||
        item.InstanceId.toLowerCase().includes(search) ||
        item.Name.toLowerCase().includes(search) ||
        item.InstanceType.toLowerCase().includes(search);
      return statePass && searchPass;
    });

    const rows: ExportRow[] = filtered.map((instance) => {
      const securityPosture = deriveSecurityPosture(instance);
      return {
        InstanceId: instance.InstanceId,
        Name: instance.Name,
        State: instance.State,
        InstanceType: instance.InstanceType,
        AvailabilityZone: instance.AvailabilityZone,
        Region: region,
        PrivateIpAddress: instance.PrivateIpAddress,
        PublicIpAddress: instance.PublicIpAddress,
        LaunchTime: instance.LaunchTime,
        VpcId: instance.VpcId,
        SubnetId: instance.SubnetId,
        SecurityGroups: instance.SecurityGroups.map((sg) => `${sg.GroupName}(${sg.GroupId})`).join(";"),
        Tags: instance.Tags.map((tag) => `${tag.Key}=${tag.Value}`).join(";"),
        SecurityPosture: securityPosture.join("|"),
      };
    });

    if (format === "json") {
      const body = {
        generatedAt: new Date().toISOString(),
        region,
        summary: summarizeStates(rows),
        instances: rows,
      };
      return NextResponse.json(body);
    }

    const csv = toCsv(rows);
    const filename = `ec2-report-${region}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const message = getFriendlyAwsErrorMessage(error, "Failed to export EC2 report.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function flattenInstances(reservations: Array<{ Instances?: Instance[] }>) {
  const output: Array<{
    InstanceId: string;
    Name: string;
    State: string;
    InstanceType: string;
    AvailabilityZone: string;
    PrivateIpAddress: string;
    PublicIpAddress: string;
    LaunchTime: string;
    VpcId: string;
    SubnetId: string;
    IamInstanceProfile: string;
    SecurityGroups: Array<{ GroupId: string; GroupName: string }>;
    Tags: Array<{ Key: string; Value: string }>;
  }> = [];

  reservations.forEach((reservation) => {
    (reservation.Instances ?? []).forEach((instance) => {
      output.push({
        InstanceId: instance.InstanceId || "",
        Name: instance.Tags?.find((tag) => tag.Key === "Name")?.Value || "",
        State: instance.State?.Name || "",
        InstanceType: instance.InstanceType || "",
        AvailabilityZone: instance.Placement?.AvailabilityZone || "",
        PrivateIpAddress: instance.PrivateIpAddress || "",
        PublicIpAddress: instance.PublicIpAddress || "",
        LaunchTime: instance.LaunchTime?.toISOString() || "",
        VpcId: instance.VpcId || "",
        SubnetId: instance.SubnetId || "",
        IamInstanceProfile: instance.IamInstanceProfile?.Arn || "",
        SecurityGroups:
          instance.SecurityGroups?.map((sg) => ({
            GroupId: sg.GroupId || "",
            GroupName: sg.GroupName || "",
          })) || [],
        Tags:
          instance.Tags?.map((tag) => ({
            Key: tag.Key || "",
            Value: tag.Value || "",
          })) || [],
      });
    });
  });

  return output;
}

function deriveSecurityPosture(instance: {
  PublicIpAddress: string;
  IamInstanceProfile: string;
  SecurityGroups: Array<{ GroupId: string; GroupName: string }>;
}) {
  const posture: string[] = [];
  if (instance.PublicIpAddress) posture.push("PUBLIC_ENDPOINT");
  if (!instance.IamInstanceProfile) posture.push("NO_IAM_ROLE");
  if (instance.SecurityGroups.length === 0) posture.push("NO_SECURITY_GROUP");
  if (posture.length === 0) posture.push("OK");
  return posture;
}

function summarizeStates(rows: ExportRow[]) {
  const summary: Record<string, number> = { total: rows.length };
  rows.forEach((row) => {
    const key = row.State || "unknown";
    summary[key] = (summary[key] ?? 0) + 1;
  });
  return summary;
}

function toCsv(rows: ExportRow[]) {
  const columns: Array<keyof ExportRow> = [
    "InstanceId",
    "Name",
    "State",
    "InstanceType",
    "AvailabilityZone",
    "Region",
    "PrivateIpAddress",
    "PublicIpAddress",
    "LaunchTime",
    "VpcId",
    "SubnetId",
    "SecurityGroups",
    "Tags",
    "SecurityPosture",
  ];

  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((column) => csvEscape(String(row[column] ?? ""))).join(","));
  return [header, ...lines].join("\n");
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
