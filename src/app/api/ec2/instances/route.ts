import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from "fast-xml-parser";

// Copy of interfaces and functions from server/ec2.functions.ts

interface Ec2Tag {
  Key: string;
  Value: string;
}

interface Ec2BlockDevice {
  DeviceName: string;
  VolumeId?: string;
  Status?: string;
  AttachTime?: string;
  DeleteOnTermination?: boolean;
  Size?: number;
  VolumeType?: string;
  Iops?: number;
  Throughput?: number;
  Encrypted?: boolean;
  SnapshotId?: string;
  AvailabilityZone?: string;
  CreateTime?: string;
}

interface Ec2NetworkInterface {
  NetworkInterfaceId: string;
  SubnetId?: string;
  VpcId?: string;
  Description?: string;
  Status?: string;
  MacAddress?: string;
  PrivateIpAddress?: string;
  PrivateDnsName?: string;
  SourceDestCheck?: boolean;
  Groups?: { GroupId: string; GroupName: string }[];
  OwnerId?: string;
  AttachmentId?: string;
  AttachmentStatus?: string;
  DeviceIndex?: number;
  DeleteOnTermination?: boolean;
  PublicIp?: string;
  AssociationPublicDnsName?: string;
}

interface Ec2SecurityGroup {
  GroupId: string;
  GroupName: string;
}

interface Ec2Instance {
  InstanceId: string;
  Name: string;
  State: string;
  StateReason?: string;
  InstanceType: string;
  AvailabilityZone: string;
  PrivateIpAddress?: string;
  PublicIpAddress?: string;
  PrivateDnsName?: string;
  PublicDnsName?: string;
  ImageId: string;
  KeyName?: string;
  LaunchTime: string;
  VpcId?: string;
  SubnetId?: string;
  Architecture?: string;
  Platform?: string;
  PlatformDetails?: string;
  RootDeviceName?: string;
  RootDeviceType?: string;
  VirtualizationType?: string;
  Hypervisor?: string;
  EbsOptimized?: boolean;
  Monitoring?: string;
  CpuCoreCount?: number;
  CpuThreadsPerCore?: number;
  IamInstanceProfile?: string;
  Tags: Ec2Tag[];
  SecurityGroups: Ec2SecurityGroup[];
  BlockDeviceMappings: Ec2BlockDevice[];
  NetworkInterfaces: Ec2NetworkInterface[];
}

const toArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

function extractInstances(xmlObj: any): Ec2Instance[] {
  const reservations = toArray(xmlObj?.DescribeInstancesResponse?.reservationSet?.item);
  const out: Ec2Instance[] = [];
  for (const r of reservations) {
    const items = toArray(r?.instancesSet?.item);
    for (const i of items) {
      const tags: Ec2Tag[] = toArray(i?.tagSet?.item).map((t: any) => ({
        Key: String(t.key ?? ""),
        Value: String(t.value ?? ""),
      }));
      const nameTag = tags.find((t) => t.Key === "Name");
      out.push({
        InstanceId: i.instanceId,
        Name: nameTag?.Value ?? "",
        State: i?.instanceState?.name ?? "unknown",
        StateReason: i?.stateReason?.message,
        InstanceType: i.instanceType,
        AvailabilityZone: i?.placement?.availabilityZone ?? "",
        PrivateIpAddress: i.privateIpAddress,
        PublicIpAddress: i.ipAddress,
        PrivateDnsName: i.privateDnsName,
        PublicDnsName: i.dnsName,
        ImageId: i.imageId,
        KeyName: i.keyName,
        LaunchTime: i.launchTime,
        VpcId: i.vpcId,
        SubnetId: i.subnetId,
        Architecture: i.architecture,
        Platform: i.platform,
        PlatformDetails: i.platformDetails,
        RootDeviceName: i.rootDeviceName,
        RootDeviceType: i.rootDeviceType,
        VirtualizationType: i.virtualizationType,
        Hypervisor: i.hypervisor,
        EbsOptimized: i.ebsOptimized === "true" || i.ebsOptimized === true,
        Monitoring: i?.monitoring?.state,
        CpuCoreCount: i?.cpuOptions?.coreCount ? Number(i.cpuOptions.coreCount) : undefined,
        CpuThreadsPerCore: i?.cpuOptions?.threadsPerCore
          ? Number(i.cpuOptions.threadsPerCore)
          : undefined,
        IamInstanceProfile: i?.iamInstanceProfile?.arn,
        Tags: tags,
        SecurityGroups: toArray(i?.groupSet?.item).map((g: any) => ({
          GroupId: g.groupId,
          GroupName: g.groupName,
        })),
        BlockDeviceMappings: toArray(i?.blockDeviceMapping?.item).map((b: any) => ({
          DeviceName: b.deviceName,
          VolumeId: b?.ebs?.volumeId,
          Status: b?.ebs?.status,
          AttachTime: b?.ebs?.attachTime,
          DeleteOnTermination:
            b?.ebs?.deleteOnTermination === "true" || b?.ebs?.deleteOnTermination === true,
        })),
        NetworkInterfaces: toArray(i?.networkInterfaceSet?.item).map((n: any) => ({
          NetworkInterfaceId: n.networkInterfaceId,
          SubnetId: n.subnetId,
          VpcId: n.vpcId,
          Description: n.description,
          Status: n.status,
          MacAddress: n.macAddress,
          PrivateIpAddress: n.privateIpAddress,
          PrivateDnsName: n.privateDnsName,
          SourceDestCheck: n.sourceDestCheck === "true" || n.sourceDestCheck === true,
          Groups: toArray(n?.groupSet?.item).map((g: any) => ({
            GroupId: g.groupId,
            GroupName: g.groupName,
          })),
          OwnerId: n.ownerId,
          AttachmentId: n?.attachment?.attachmentId,
          AttachmentStatus: n?.attachment?.status,
          DeviceIndex: n?.attachment?.deviceIndex ? Number(n.attachment.deviceIndex) : undefined,
          DeleteOnTermination:
            n?.attachment?.deleteOnTermination === "true" || n?.attachment?.deleteOnTermination === true,
          PublicIp: n?.association?.publicIp,
          AssociationPublicDnsName: n?.association?.publicDnsName,
        })),
      });
    }
  }
  return out;
}

// Copy of signEc2Request from aws-sigv4.ts

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(data));
  return toHex(buf);
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
}

async function deriveSigningKey(
  secret: string,
  date: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode("AWS4" + secret), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  method: "POST";
}

async function signEc2Request(
  params: Record<string, string>,
  options: { region?: string; service?: string } = {},
): Promise<SignedRequest> {
  const region = options.region || process.env.AWS_REGION || "us-east-1";
  const service = options.service || "ec2";
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKey || !secretKey) {
    throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set");
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 8).replace(/-/g, "");
  const datetime = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");

  const host = `${service}.${region}.amazonaws.com`;
  const url = `https://${host}/`;

  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");

  const canonicalHeaders = `host:${host}\nx-amz-date:${datetime}\n`;
  const signedHeaders = "host;x-amz-date";

  const payloadHash = await sha256Hex("");

  const canonicalRequest = `POST\n/\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${datetime}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const signingKey = await deriveSigningKey(secretKey, date, region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url,
    method: "POST",
    headers: {
      Authorization: authorization,
      "x-amz-date": datetime,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: canonicalQuery,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region') || process.env.AWS_REGION;

  try {
    const signed = await signEc2Request(
      { Action: "DescribeInstances", Version: "2016-11-15" },
      { region },
    );
    const res = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: signed.body,
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("EC2 DescribeInstances failed:", res.status, text);
      return NextResponse.json({
        instances: [] as Ec2Instance[],
        error: `AWS error ${res.status}: ${text.slice(0, 300)}`,
        region: region ?? null,
      });
    }
    const parser = new XMLParser({ ignoreAttributes: true });
    const obj = parser.parse(text);
    const instances = extractInstances(obj);
    return NextResponse.json({ instances, error: null as string | null, region: region ?? null });
  } catch (e: any) {
    console.error("listEc2Instances failed:", e);
    return NextResponse.json({
      instances: [] as Ec2Instance[],
      error: e?.message ?? "Unknown error",
      region: region ?? null,
    });
  }
}