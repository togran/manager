import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { getAwsCredentials } from "@/lib/aws";

type EncryptedCredentialsResponse = {
  accessKeyId: string;
  encryptedSecretAccessKey: string;
  encryptedSessionToken?: string;
  region: string;
};

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;

  try {
    const credentials = await getAwsCredentials(auth.session.role);
    const payload: EncryptedCredentialsResponse = {
      accessKeyId: credentials.accessKeyId,
      encryptedSecretAccessKey: decrypt(credentials.secretAccessKey, ''),
      region: credentials.region,
    };

    if (credentials.sessionToken) {
      payload.encryptedSessionToken = decrypt(credentials.sessionToken, '');
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AWS credentials";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
