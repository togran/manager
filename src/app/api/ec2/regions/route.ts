import { NextResponse } from 'next/server';
import { requireSession } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { DescribeInstancesCommand, EC2Client } from "@aws-sdk/client-ec2";
import { getAwsCredentials } from "@/lib/aws";
import { getFriendlyAwsErrorMessage } from "@/lib/errors";

const REGIONS = [
  // United States
  { code: "us-east-1", name: "US East (N. Virginia)", group: "United States" },
  { code: "us-east-2", name: "US East (Ohio)", group: "United States" },
  { code: "us-west-1", name: "US West (N. California)", group: "United States" },
  { code: "us-west-2", name: "US West (Oregon)", group: "United States" },
  // Asia Pacific
  { code: "ap-south-2", name: "Asia Pacific (Hyderabad)", group: "Asia Pacific" },
  { code: "ap-south-1", name: "Asia Pacific (Mumbai)", group: "Asia Pacific" },
  { code: "ap-northeast-3", name: "Asia Pacific (Osaka)", group: "Asia Pacific" },
  { code: "ap-northeast-2", name: "Asia Pacific (Seoul)", group: "Asia Pacific" },
  { code: "ap-southeast-1", name: "Asia Pacific (Singapore)", group: "Asia Pacific" },
  { code: "ap-southeast-2", name: "Asia Pacific (Sydney)", group: "Asia Pacific" },
  { code: "ap-northeast-1", name: "Asia Pacific (Tokyo)", group: "Asia Pacific" },
  // Canada
  { code: "ca-central-1", name: "Canada (Central)", group: "Canada" },
  // Europe
  { code: "eu-central-1", name: "Europe (Frankfurt)", group: "Europe" },
  { code: "eu-west-1", name: "Europe (Ireland)", group: "Europe" },
  { code: "eu-west-2", name: "Europe (London)", group: "Europe" },
  { code: "eu-west-3", name: "Europe (Paris)", group: "Europe" },
  { code: "eu-north-1", name: "Europe (Stockholm)", group: "Europe" },
  // South America
  { code: "sa-east-1", name: "South America (São Paulo)", group: "South America" },
];

const REGIONS_CACHE_TTL_MS = 60_000; // 60s
const regionsCache = new Map<string, { expires: number; data: typeof REGIONS }>();

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  try {
    const cacheKey = `regions-with-instances:${auth.session.role}`;
    const cached = regionsCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json({ regions: cached.data, default: process.env.AWS_REGION ?? null });
    }

    const creds = await getAwsCredentials(auth.session.role);
    const regionsWithInstances: typeof REGIONS = [];

    for (const r of REGIONS) {
      try {
        const client = new EC2Client({
          region: r.code,
          credentials: {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
            sessionToken: creds.sessionToken,
          },
        });
        const resp = await client.send(new DescribeInstancesCommand({ MaxResults: 1 }));
        if (resp.Reservations && resp.Reservations.some((res) => res.Instances && res.Instances.length > 0)) {
          regionsWithInstances.push(r);
        }
      } catch (err) {
        // Ignore per-region errors (permission/region not enabled) and continue
        continue;
      }
    }

    regionsCache.set(cacheKey, { expires: Date.now() + REGIONS_CACHE_TTL_MS, data: regionsWithInstances });

    return NextResponse.json({ regions: regionsWithInstances, default: process.env.AWS_REGION ?? null });
  } catch (err: unknown) {
    const errorMessage = getFriendlyAwsErrorMessage(err, "Failed to load EC2 regions with instances.");
    return NextResponse.json({ success: false, regions: [], error: errorMessage }, { status: 500 });
  }
}