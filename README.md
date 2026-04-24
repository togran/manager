# Instance Inspector (Next.js + AWS EC2)

Instance Inspector is a Next.js App Router project to monitor and manage EC2 instances with role-based access control and secure AWS credential handling.

## Project Overview

- Authentication with session cookies and JWT
- Role-based access (`admin` / `user`)
- EC2 operations: list, status, start, stop, reboot, terminate
- CloudWatch metrics for instance performance
- Secure credential flow with AES-256-GCM encryption/decryption

## Features

- **Auth + RBAC**
  - Login endpoint with password verification
  - Session middleware and route guards
  - Admin-only instance actions
- **AWS Integration**
  - Credentials loaded from external API or environment
  - EC2 and CloudWatch clients created server-side
  - Region-aware APIs
- **Encryption System**
  - `src/lib/crypto.ts` provides `encrypt(text)` and `decrypt(encryptedText)`
  - Uses Node.js `crypto`, AES-256-GCM, random IV, authentication tag
  - Uses `ENCRYPTION_SECRET` from environment
  - Supports payload expiry checks (`ENCRYPTION_TOKEN_MAX_AGE_SECONDS`)

## Step-by-Step: How This Project Works

1. User logs in via `/api/auth/login`.
2. Server validates credentials and sets secure session cookie.
3. Frontend calls EC2 routes (for example `/api/ec2/instances`).
4. Route validates session and role using `requireSession`.
5. Server loads AWS credentials from:
   - External credentials API (`AWS_CREDENTIALS_API_URL` / `AWS_CREDENTIALS_API_BASE_URL`), or
   - Environment fallback (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`), or
   - Mock fallback in local development.
6. If external API returns encrypted secret fields, the server decrypts them in `src/lib/aws.ts`.
7. AWS SDK client executes the request and sanitized response goes to frontend.
8. Raw secrets are never returned by EC2 feature APIs.

## Encryption and Decryption Flow

### 1) Crypto Utility

Location: `src/lib/crypto.ts`

- `encrypt(text: string): string`
- `decrypt(encryptedText: string): string`

Encrypted token format:

`v1.<iv>.<tag>.<issuedAtUnixSeconds>.<cipherText>`

All parts use base64url (except version and timestamp).

### 2) Secure API Response for Frontend

New route: `GET /api/aws/credentials`

Returns only encrypted credential values:

```json
{
  "accessKeyId": "AKIA...",
  "encryptedSecretAccessKey": "v1....",
  "encryptedSessionToken": "v1....",
  "region": "ap-south-1"
}
```

No raw `secretAccessKey` is exposed in that response.

### 3) External API Encrypted Input Support

`src/lib/aws.ts` accepts encrypted input fields:

- `encryptedSecretAccessKey`
- `encrypted_secret_access_key`
- `encryptedSessionToken`
- `encrypted_session_token`

These are decrypted server-side only.

## Security Rules Implemented

- `ENCRYPTION_SECRET` stays on server env only (never expose as `NEXT_PUBLIC_*`).
- `src/lib/crypto.ts` uses `server-only` to prevent client bundling.
- Decrypt failures return safe errors and do not leak key material.
- Expired encrypted tokens are rejected.
- Existing EC2 APIs continue to avoid sending secrets to frontend.

## Required Environment Variables

Minimum:

```env
ENCRYPTION_SECRET=replace-with-long-random-secret
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=ap-south-1
AUTH_JWT_SECRET=replace-with-a-long-random-secret
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=replace-with-strong-password
```

Optional:

```env
ENCRYPTION_TOKEN_MAX_AGE_SECONDS=900
AWS_CREDENTIALS_API_URL=
AWS_CREDENTIALS_API_BASE_URL=
AWS_CREDENTIALS_ALLOW_MOCK=true
MOCK_AWS_ACCESS_KEY_ID=mock_access_key_id
MOCK_AWS_SECRET_ACCESS_KEY=mock_secret_access_key
MOCK_AWS_SESSION_TOKEN=
MOCK_AWS_REGION=ap-south-1
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Fill required values in `.env`.

4. Start dev server:

```bash
npm run dev
```

5. Open app:

[http://localhost:3000](http://localhost:3000)

## Production Notes

- Rotate `ENCRYPTION_SECRET` and AWS keys periodically.
- Use IAM roles with least-privilege policies.
- Set `AWS_CREDENTIALS_ALLOW_MOCK=false` in production.
- Keep encryption and decryption server-side wherever possible.
- Never log raw credentials or encrypted payload internals in production logs.
