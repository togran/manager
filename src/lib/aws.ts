import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { EC2Client } from "@aws-sdk/client-ec2";
import type { UserRole } from "@/lib/db";
import { assertRole } from "@/lib/roles";

type AwsCredentialsApiResponse = {
  accessKeyId: string;
  secretAccessKey: string;
  access_key_id?: string;
  secret_key?: string;
  secret_access_key?: string;
  region?: string;
  sessionToken?: string;
  session_token?: string;
};

const AWS_CREDENTIALS_API_BASE_URL = "http://66.45.236.190";

export type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
};

function getDefaultRegion() {
  return process.env.AWS_REGION || "ap-southeast-1";
}

export async function getAwsCredentials(inputRole: unknown): Promise<AwsCredentials> {
  const role = assertRole(inputRole);
  const apiBase = AWS_CREDENTIALS_API_BASE_URL;
  const url = `${apiBase}/getkey?role=${encodeURIComponent(role)}`;

  console.log(`[aws] Fetching credentials for role=${role} from ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Credential API failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const body = (await response.json()) as AwsCredentialsApiResponse;
  const accessKeyId = body.accessKeyId || body.access_key_id;
  const secretAccessKey = body.secretAccessKey || body.secret_access_key || body.secret_key;
  const sessionToken = body.sessionToken || body.session_token;

  console.log("[aws] Credential API response:", {
    hasAccessKeyId: Boolean(accessKeyId),
    hasSecretAccessKey: Boolean(secretAccessKey),
    hasSessionToken: Boolean(sessionToken),
    region: body?.region ?? null,
  });

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Credential API response missing accessKeyId/secretAccessKey");
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
    region: body.region || getDefaultRegion(),
  };
}

export async function createEc2Client(role: UserRole, region?: string | null) {
  const credentials = await getAwsCredentials(role);
  const resolvedRegion = region || credentials.region || getDefaultRegion();
  return new EC2Client({
    region: resolvedRegion,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

export async function createCloudWatchClient(role: UserRole, region?: string | null) {
  const credentials = await getAwsCredentials(role);
  const resolvedRegion = region || credentials.region || getDefaultRegion();
  return new CloudWatchClient({
    region: resolvedRegion,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}
