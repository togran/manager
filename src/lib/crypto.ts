import "server-only";
import { createDecipheriv, createHash } from "crypto";

const AES_ALGORITHM = "aes-256-gcm";
const ENCRYPTED_VALUE_PARTS = 4;
const ENCRYPTED_VALUE_PARTS_WITH_TIMESTAMP = 5;
const ENCRYPTED_VALUE_VERSION = "v1";
const DEFAULT_TOKEN_MAX_AGE_SECONDS = 900;

export type EncryptedText = string;

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

function deriveKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function getMaxAgeSeconds() {
  const raw = process.env.ENCRYPTION_TOKEN_MAX_AGE_SECONDS;
  if (!raw) return DEFAULT_TOKEN_MAX_AGE_SECONDS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOKEN_MAX_AGE_SECONDS;
}

function parseEncryptedPayload(encryptedText: string) {
  const parts = encryptedText.split(".");
  if (
    parts.length !== ENCRYPTED_VALUE_PARTS &&
    parts.length !== ENCRYPTED_VALUE_PARTS_WITH_TIMESTAMP
  ) {
    throw new Error("Invalid encrypted payload format");
  }

  const [version, iv, tag, maybeIssuedAt, maybeContent] = parts;
  if (version !== ENCRYPTED_VALUE_VERSION) {
    throw new Error("Unsupported encrypted payload version");
  }

  const issuedAt = maybeContent ? Number(maybeIssuedAt) : null;
  const content = maybeContent || maybeIssuedAt;
  if (!iv || !tag || !content) {
    throw new Error("Encrypted payload is missing required fields");
  }

  if (maybeContent && (!Number.isFinite(issuedAt) || (issuedAt ?? 0) <= 0)) {
    throw new Error("Encrypted payload has invalid issue time");
  }

  return { iv, tag, content, issuedAt };
}

function assertNotExpired(issuedAt: number | null) {
  if (!issuedAt) return;
  const ageInSeconds = Math.floor(Date.now() / 1000) - issuedAt;
  if (ageInSeconds > getMaxAgeSeconds()) {
    throw new Error("Encrypted payload has expired");
  }
}

export function decrypt(encryptedText: EncryptedText, secret: string): string {
  try {
    const { iv, tag, content, issuedAt } = parseEncryptedPayload(encryptedText);
    assertNotExpired(issuedAt);
    const key = deriveKey(secret);
    const decipher = createDecipheriv(AES_ALGORITHM, key, fromBase64Url(iv));
    decipher.setAuthTag(fromBase64Url(tag));
    const decrypted = Buffer.concat([decipher.update(fromBase64Url(content)), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    throw new Error(
      `Unable to decrypt payload: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}
