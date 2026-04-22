// AWS Signature V4 signer using Web Crypto API (Worker-compatible).
// Used to call AWS EC2 query API directly without an SDK.

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

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  method: "POST";
}

/**
 * Sign a POST request to an AWS query API endpoint.
 * Defaults to the EC2 service in AWS_REGION but accepts overrides
 * so the same signer works for CloudWatch (`monitoring`) and other regions.
 */
export async function signEc2Request(
  params: Record<string, string>,
  opts: { service?: string; region?: string; host?: string } = {},
): Promise<SignedRequest> {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = opts.region || process.env.AWS_REGION;

  if (!accessKey) throw new Error("AWS_ACCESS_KEY_ID is not configured");
  if (!secretKey) throw new Error("AWS_SECRET_ACCESS_KEY is not configured");
  if (!region) throw new Error("AWS_REGION is not configured");

  const service = opts.service ?? "ec2";
  const host = opts.host ?? `${service}.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const body = new URLSearchParams(params).toString();
  const payloadHash = await sha256Hex(body);

  const canonicalHeaders =
    `content-type:application/x-www-form-urlencoded; charset=utf-8\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";

  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(secretKey, dateStamp, region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: endpoint,
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "X-Amz-Date": amzDate,
      Authorization: authorization,
    },
  };
}
