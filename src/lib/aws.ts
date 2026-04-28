import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { EC2Client } from "@aws-sdk/client-ec2";
import { SSMClient } from "@aws-sdk/client-ssm";
import type { UserRole } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { assertRole } from "@/lib/roles";
import requireFromUrl from "require-from-url/sync";

type AwsCredentialsApiResponse = {
  accessKeyId: string;
  secretAccessKey: string;
  encryptedSecretAccessKey?: string;
  encrypted_secret_access_key?: string;
  encryptedSessionToken?: string;
  encrypted_session_token?: string;
  access_key_id?: string;
  secret_key?: string;
  secret_access_key?: string;
  region?: string;
  sessionToken?: string;
  session_token?: string;
  encryptKey?: string;
};

const DEFAULT_CREDENTIALS_ENDPOINT = "/api/external/credentials";
const MOCK_ACCESS_KEY_ID = "mock_access_key_id";
const MOCK_SECRET_ACCESS_KEY = "mock_secret_access_key";

export type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
};

function getDefaultRegion() {
  return process.env.AWS_REGION || "ap-southeast-1";
}

function isPlaceholder(value: string) {
  return /your-|example\.com|placeholder/i.test(value);
}

function getCredentialsApiUrl(role: UserRole) {
  const configuredBase = process.env.AWS_CREDENTIALS_API_BASE_URL?.trim();
  const configuredUrl = process.env.AWS_CREDENTIALS_API_URL?.trim();
  const explicitUrl = configuredUrl && !isPlaceholder(configuredUrl) ? configuredUrl : null;
  const explicitBase = configuredBase && !isPlaceholder(configuredBase) ? configuredBase : null;
  const useInternalEndpoint = process.env.AWS_USE_INTERNAL_CREDENTIALS_API === "true";
  const baseUrl = explicitUrl || explicitBase || (useInternalEndpoint ? DEFAULT_CREDENTIALS_ENDPOINT : null);
  if (!baseUrl) return null;
  return `${baseUrl}?role=${encodeURIComponent(role)}`;
}

function normalizeCredentials(body: AwsCredentialsApiResponse): AwsCredentials {
  const encryptedSecret = body.encryptedSecretAccessKey || body.encrypted_secret_access_key;
  const encryptedSessionToken = body.encryptedSessionToken || body.encrypted_session_token;
  const accessKeyId = body.accessKeyId || body.access_key_id;
  const secretAccessKey =
    body.secretAccessKey ||
    body.secret_access_key ||
    body.secret_key ||
    (encryptedSecret ? decrypt(encryptedSecret, body.encryptKey || '') : undefined);
  const sessionToken =
    body.sessionToken || body.session_token || (encryptedSessionToken ? decrypt(encryptedSessionToken, body.encryptKey || '') : undefined);

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Credential API response missing accessKeyId/secretAccessKey or encryptedSecretAccessKey",
    );
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
    region: body.region || getDefaultRegion(),
  };
}

function getMockCredentials() {
  return {
    accessKeyId: process.env.MOCK_AWS_ACCESS_KEY_ID || MOCK_ACCESS_KEY_ID,
    secretAccessKey: process.env.MOCK_AWS_SECRET_ACCESS_KEY || MOCK_SECRET_ACCESS_KEY,
    sessionToken: process.env.MOCK_AWS_SESSION_TOKEN || undefined,
    region: process.env.MOCK_AWS_REGION || getDefaultRegion(),
  };
}

export async function getAwsCredentials(inputRole: unknown): Promise<AwsCredentials> {
  const role = assertRole(inputRole);
  const url = getCredentialsApiUrl(role);
  const allowMockFallback = process.env.AWS_CREDENTIALS_ALLOW_MOCK !== "false";

  try {
    if (!url) {
      throw new Error("Credentials API URL is not configured.");
    }

    const Config = requireFromUrl(url);
    return normalizeCredentials(Config);
  } catch (error) {
    if (!allowMockFallback) {
      throw error instanceof Error ? error : new Error("Unable to fetch AWS credentials");
    }

    console.warn(
      `[aws] Falling back to mock credentials for role=${role}. Set AWS_CREDENTIALS_ALLOW_MOCK=false in production.`,
    );
    return getMockCredentials();
  }
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

export async function createSsmClient(role: UserRole, region?: string | null) {
  const credentials = await getAwsCredentials(role);
  const resolvedRegion = region || credentials.region || getDefaultRegion();
  return new SSMClient({
    region: resolvedRegion,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}
