import { NextRequest, NextResponse } from "next/server";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import type { Instance } from "@aws-sdk/client-ec2";

interface InstanceResponse {
  InstanceId: string;
  Name: string;
  InstanceType: string;
  State: string;
  PrivateIpAddress?: string;
  PublicIpAddress?: string;
  BlockDeviceMappings: Array<{ VolumeId: string }>;
  SecurityGroups: Array<{ GroupId: string; GroupName: string }>;
  NetworkInterfaces: Array<{ NetworkInterfaceId: string; PrivateIp: string }>;
  Tags: Array<{ Key: string; Value: string }>;
}

export async function GET(request: NextRequest) {
  try {
    // ✅ VALIDATE ENVIRONMENT VARIABLES
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      console.error("❌ Missing AWS credentials in environment variables");
      return NextResponse.json(
        {
          success: false,
          instances: [],
          error: "AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const region =
      searchParams.get("region") ||
      process.env.AWS_REGION ||
      "ap-southeast-1";

    // ✅ CREATE EC2 CLIENT WITH VALIDATED CREDENTIALS
    const client = new EC2Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const command = new DescribeInstancesCommand({});
    const response = await client.send(command);

    const instances: InstanceResponse[] = [];

    // ✅ CORRECT LOOP STRUCTURE WITH TYPE SAFETY
    if (response.Reservations) {
      response.Reservations.forEach((reservation) => {
        if (reservation.Instances) {
          reservation.Instances.forEach((instance: Instance) => {
            instances.push({
              InstanceId: instance.InstanceId || "",
              Name: instance.Tags?.find((tag) => tag.Key === "Name")?.Value || "",
              InstanceType: instance.InstanceType || "",
              State: instance.State?.Name || "",
              PrivateIpAddress: instance.PrivateIpAddress || "",
              PublicIpAddress: instance.PublicIpAddress || "",

              BlockDeviceMappings:
                instance.BlockDeviceMappings?.map((b) => ({
                  VolumeId: b.Ebs?.VolumeId || "",
                })) || [],

              SecurityGroups:
                instance.SecurityGroups?.map((sg) => ({
                  GroupId: sg.GroupId || "",
                  GroupName: sg.GroupName || "",
                })) || [],

              NetworkInterfaces:
                instance.NetworkInterfaces?.map((ni) => ({
                  NetworkInterfaceId: ni.NetworkInterfaceId || "",
                  PrivateIp: ni.PrivateIpAddress || "",
                })) || [],

              Tags:
                instance.Tags?.map((tag) => ({
                  Key: tag.Key || "",
                  Value: tag.Value || "",
                })) || [],
            });
          });
        }
      });
    }

    return NextResponse.json({
      success: true,
      instances,
      region,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ EC2 Error:", errorMessage);

    return NextResponse.json(
      {
        success: false,
        instances: [],
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}