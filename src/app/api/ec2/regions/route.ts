import { NextResponse } from 'next/server';
import { requireSession } from "@/lib/auth";
import type { NextRequest } from "next/server";

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

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  return NextResponse.json({ regions: REGIONS, default: process.env.AWS_REGION ?? null });
}