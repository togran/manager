import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from "fast-xml-parser";

// Copy of signEc2Request and toArray

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

async function signEc2Request(
  params: Record<string, string>,
  options: { region?: string; service?: string } = {},
): Promise<{ url: string; headers: Record<string, string>; body: string; method: "POST" }> {
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

const toArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get('instanceId');
  const region = searchParams.get('region');

  if (!instanceId) {
    return NextResponse.json({ status: null, error: 'instanceId required' });
  }

  try {
    const signed = await signEc2Request(
      {
        Action: "DescribeInstanceStatus",
        Version: "2016-11-15",
        "InstanceId.1": instanceId,
        IncludeAllInstances: "true",
      },
      { region: region || undefined },
    );
    const res = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: signed.body,
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ status: null, error: `AWS error ${res.status}: ${text.slice(0, 200)}` });
    }
    const parser = new XMLParser({ ignoreAttributes: true });
    const obj = parser.parse(text);
    const item = toArray(obj?.DescribeInstanceStatusResponse?.instanceStatusSet?.item)[0];
    if (!item) return NextResponse.json({ status: null, error: null });
    return NextResponse.json({
      status: {
        AvailabilityZone: item.availabilityZone,
        InstanceState: item?.instanceState?.name,
        SystemStatus: item?.systemStatus?.status,
        InstanceStatus: item?.instanceStatus?.status,
        Events: toArray(item?.eventsSet?.item).map((e: any) => ({
          Code: e.code,
          Description: e.description,
          NotBefore: e.notBefore,
        })),
      },
      error: null,
    });
  } catch (e: any) {
    return NextResponse.json({ status: null, error: e?.message ?? "Unknown error" });
  }
}