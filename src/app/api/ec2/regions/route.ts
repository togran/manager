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
const regionsCache = new Map<
  string,
  { expires: number; data: Array<typeof REGIONS[number] & { instance_num: number }> }
>();

async function mapWithConcurrency<T, R>(items: T[], mapper: (item: T) => Promise<R>, concurrency = 6): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      try {
        results[i] = await mapper(items[i]);
      } catch (e) {
        results[i] = e as unknown as R;
      }
    }
  }
  const workers = new Array(Math.min(concurrency, items.length)).fill(null).map(() => worker());
  await Promise.all(workers);
  return results;
}

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true" || url.searchParams.get("refresh") === "true";
    const cacheKey = `regions-with-instances:${auth.session.role}`;
    const cached = !force ? regionsCache.get(cacheKey) : undefined;
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json({ regions: cached.data, default: process.env.AWS_REGION ?? null, cached: true });
    }

    const creds = await getAwsCredentials(auth.session.role);
    const concurrency = 3; // limit concurrent DescribeInstances calls to avoid API throttling

    const presence = await mapWithConcurrency(
      REGIONS,
      async (r) => {
        try {
          const client = new EC2Client({
            region: r.code,
            credentials: {
              accessKeyId: creds.accessKeyId,
              secretAccessKey: creds.secretAccessKey,
              sessionToken: creds.sessionToken,
            },
          });
          const resp = await client.send(new DescribeInstancesCommand({ MaxResults: 5 }));
          const has = !!resp.Reservations?.some((res) => res.Instances && res.Instances.length > 0);
          return { region: r, has };
        } catch {
          return { region: r, has: false };
        }
      },
      concurrency,
    );

    const positiveRegions = presence.filter((p) => p.has).map((p) => p.region);

    let targetRegions = positiveRegions;
    // If no positive regions detected, try the default region as a fallback (some credential
    // setups only allow access to the default region). This makes the endpoint more forgiving
    // for local setups where only the default region is accessible.
    if (targetRegions.length === 0) {
      const defaultRegion = process.env.AWS_REGION || "ap-south-1";
      try {
        const client = new EC2Client({
          region: defaultRegion,
          credentials: {
            accessKeyId: (creds as any).accessKeyId,
            secretAccessKey: (creds as any).secretAccessKey,
            sessionToken: (creds as any).sessionToken,
          },
        });
        const resp = await client.send(new DescribeInstancesCommand({ MaxResults: 5 }));
        const hasDefault = !!resp.Reservations?.some((res) => res.Instances && res.Instances.length > 0);
        if (hasDefault) targetRegions = [{ code: defaultRegion, name: defaultRegion, group: defaultRegion } as any];
      } catch {
        // ignore
      }
    }

    const counts = await mapWithConcurrency(
      targetRegions,
      async (r) => {
        try {
          const client = new EC2Client({
            region: r.code,
            credentials: {
              accessKeyId: creds.accessKeyId,
              secretAccessKey: creds.secretAccessKey,
              sessionToken: creds.sessionToken,
            },
          });

          let nextToken: string | undefined = undefined;
          let instanceCount = 0;
          while (true) {
            const resp = await client.send(new DescribeInstancesCommand({ NextToken: nextToken, MaxResults: 1000 }));
            if (resp.Reservations) {
              for (const reservation of resp.Reservations) {
                if (reservation.Instances) instanceCount += reservation.Instances.length;
              }
            }
            const token = (resp as any).NextToken as string | undefined;
            if (!token) break;
            nextToken = token;
          }

          return { ...r, instance_num: instanceCount };
        } catch (err) {
          return { ...r, instance_num: 0 };
        }
      },
      concurrency,
    );

    regionsCache.set(cacheKey, { expires: Date.now() + REGIONS_CACHE_TTL_MS, data: counts });

    return NextResponse.json({ regions: counts, default: process.env.AWS_REGION ?? null, cached: false });
  } catch (err: unknown) {
    const errorMessage = getFriendlyAwsErrorMessage(err, "Failed to load EC2 regions with instances.");
    return NextResponse.json({ success: false, regions: [], error: errorMessage }, { status: 500 });
  }
}