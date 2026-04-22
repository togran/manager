import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { EC2Client } from "@aws-sdk/client-ec2";
import type { UserRole } from "@/lib/db";

type AwsCredentialsResponse = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

async function fetchAwsCredentialsForRole(role: UserRole): Promise<AwsCredentialsResponse> {
  const useExternalApi = process.env.USE_EXTERNAL_AWS_CREDENTIALS === "true";

  if (!useExternalApi) {
    const rolePrefix = role === "admin" ? "AWS_ADMIN" : "AWS_USER";
    const accessKeyId =
      process.env[`${rolePrefix}_ACCESS_KEY_ID`] || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env[`${rolePrefix}_SECRET_ACCESS_KEY`] || process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken =
      process.env[`${rolePrefix}_SESSION_TOKEN`] || process.env.AWS_SESSION_TOKEN;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        `${rolePrefix}_ACCESS_KEY_ID/${rolePrefix}_SECRET_ACCESS_KEY or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY must be configured`,
      );
    }

    return { accessKeyId, secretAccessKey, sessionToken };
  }

  const explicitUrl = process.env.AWS_CREDENTIALS_API_URL;
  const baseUrl = process.env.AWS_CREDENTIALS_API_BASE_URL;

  const url = explicitUrl
    ? `${explicitUrl}${explicitUrl.includes("?") ? "&" : "?"}role=${encodeURIComponent(role)}`
    : baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/get-aws-credentials?role=${encodeURIComponent(role)}`
      : null;

  if (!url) {
    throw new Error(
      "When USE_EXTERNAL_AWS_CREDENTIALS=true, set AWS_CREDENTIALS_API_URL or AWS_CREDENTIALS_API_BASE_URL",
    );
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Credential API failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const body = (await response.json()) as AwsCredentialsResponse;
  if (!body.accessKeyId || !body.secretAccessKey) {
    throw new Error("Credential API response missing accessKeyId/secretAccessKey");
  }
  return body;
}

function getRegion(inputRegion?: string | null) {
  return inputRegion || process.env.AWS_REGION || "ap-southeast-1";
}

export async function createEc2Client(role: UserRole, region?: string | null) {
  const credentials = await fetchAwsCredentialsForRole(role);
  return new EC2Client({
    region: getRegion(region),
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

export async function createCloudWatchClient(role: UserRole, region?: string | null) {
  const credentials = await fetchAwsCredentialsForRole(role);
  return new CloudWatchClient({
    region: getRegion(region),
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}
