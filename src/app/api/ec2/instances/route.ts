import { NextRequest, NextResponse } from "next/server";
import { DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import type { Instance } from "@aws-sdk/client-ec2";
import { createEc2Client } from "@/lib/aws";
import { requireSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region") || process.env.AWS_REGION || "ap-southeast-1";
    const client = await createEc2Client(auth.session.role, region);

    const command = new DescribeInstancesCommand({});
    const response = await client.send(command);

    const instances: Record<string, unknown>[] = [];

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
              StateReason: instance.StateReason?.Message || "",
              AvailabilityZone: instance.Placement?.AvailabilityZone || "",
              PrivateIpAddress: instance.PrivateIpAddress || "",
              PublicIpAddress: instance.PublicIpAddress || "",
              PrivateDnsName: instance.PrivateDnsName || "",
              PublicDnsName: instance.PublicDnsName || "",
              ImageId: instance.ImageId || "",
              KeyName: instance.KeyName || "",
              LaunchTime: instance.LaunchTime?.toISOString() || "",
              VpcId: instance.VpcId || "",
              SubnetId: instance.SubnetId || "",
              Architecture: instance.Architecture || "",
              Platform: instance.Platform || "",
              PlatformDetails: instance.PlatformDetails || "",
              RootDeviceName: instance.RootDeviceName || "",
              RootDeviceType: instance.RootDeviceType || "",
              VirtualizationType: instance.VirtualizationType || "",
              Hypervisor: instance.Hypervisor || "",
              EbsOptimized: instance.EbsOptimized ?? false,
              Monitoring: instance.Monitoring?.State || "",
              CpuCoreCount: instance.CpuOptions?.CoreCount || 0,
              CpuThreadsPerCore: instance.CpuOptions?.ThreadsPerCore || 0,
              IamInstanceProfile: instance.IamInstanceProfile?.Arn || "",

              BlockDeviceMappings:
                instance.BlockDeviceMappings?.map((b) => ({
                  DeviceName: b.DeviceName || "",
                  VolumeId: b.Ebs?.VolumeId || "",
                  Status: b.Ebs?.Status || "",
                  AttachTime: b.Ebs?.AttachTime?.toISOString() || "",
                  DeleteOnTermination: b.Ebs?.DeleteOnTermination ?? false,
                })) || [],

              SecurityGroups:
                instance.SecurityGroups?.map((sg) => ({
                  GroupId: sg.GroupId || "",
                  GroupName: sg.GroupName || "",
                })) || [],

              NetworkInterfaces:
                instance.NetworkInterfaces?.map((ni) => ({
                  NetworkInterfaceId: ni.NetworkInterfaceId || "",
                  SubnetId: ni.SubnetId || "",
                  VpcId: ni.VpcId || "",
                  Description: ni.Description || "",
                  Status: ni.Status || "",
                  MacAddress: ni.MacAddress || "",
                  PrivateIpAddress: ni.PrivateIpAddress || "",
                  PrivateDnsName: ni.PrivateDnsName || "",
                  SourceDestCheck: ni.SourceDestCheck ?? false,
                  Groups:
                    ni.Groups?.map((g) => ({
                      GroupId: g.GroupId || "",
                      GroupName: g.GroupName || "",
                    })) || [],
                  AttachmentId: ni.Attachment?.AttachmentId || "",
                  AttachmentStatus: ni.Attachment?.Status || "",
                  DeviceIndex: ni.Attachment?.DeviceIndex || 0,
                  DeleteOnTermination: ni.Attachment?.DeleteOnTermination ?? false,
                  PublicIp: ni.Association?.PublicIp || "",
                  AssociationPublicDnsName: ni.Association?.PublicDnsName || "",
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

    return NextResponse.json({ success: true, instances, region });

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