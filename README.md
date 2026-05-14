# Instance Inspector (Next.js + AWS EC2)

Instance Inspector is a Next.js App Router application for monitoring and operating EC2 infrastructure with secure credential handling, role-based access, audit history, and export-ready reporting.

## What This Project Provides

- EC2 instance inventory with filters, sorting, and quick selection
- Instance operations (`start`, `stop`, `reboot`, `terminate`) with admin-only authorization
- CloudWatch metrics for operational visibility
- node_exporter host metrics for load, memory, swap, disk IOPS, network throughput, uptime, OS details, and filesystem utilization
- Lifecycle timeline (launch, status checks, scheduled AWS events, action history)
- CSV/JSON export reports with security posture hints
- JWT session authentication and role-based access control (`admin` / `user`)
- Encrypted AWS secret flow using AES-256-GCM

## Architecture Overview

### Runtime Stack

- Framework: Next.js (App Router)
- Language: TypeScript
- UI: React + Tailwind + shadcn/radix components
- Data store: SQLite (`better-sqlite3`)
- Cloud SDK: AWS SDK v3 (`@aws-sdk/client-ec2`, `@aws-sdk/client-cloudwatch`)
- Auth: Signed JWT session cookie (`jose`)

### High-Level Flow

1. User logs in via `/api/auth/login`
2. Server sets an httpOnly session cookie
3. Frontend calls protected API routes
4. API routes validate session/role (`requireSession`)
5. AWS client is created server-side (`src/lib/aws.ts`)
6. AWS responses are normalized and returned to UI
7. Admin actions are persisted into local audit logs

## Folder Architecture

```text
src/
  app/
    page.tsx                         # Main EC2 console UI
    login/page.tsx                   # Login screen
    admin/users/page.tsx             # Admin user management
    api/
      auth/                          # login/logout/session routes
      users/                         # user CRUD endpoints
      aws/credentials/               # encrypted credentials response
      ec2/
        regions/                     # region listing
        instances/                   # inventory
        status/                      # per-instance status checks/events
        metrics/                     # CloudWatch metrics
        node-exporter/               # host metrics proxy + parser for node_exporter
        actions/                     # start/stop/reboot/terminate
        timeline/                    # lifecycle + action history
        export/                      # CSV/JSON report export
  components/
    ec2/
      InstanceDetail.tsx             # Detailed EC2 tabs (status/timeline/etc)
      MetricsCharts.tsx              # Metric graphs
      StateBadge.tsx                 # state badge rendering
  lib/
    auth.ts                          # session handling + route guards
    aws.ts                           # AWS credential resolution + clients
    crypto.ts                        # encrypt/decrypt utilities
    db.ts                            # SQLite schema + data access helpers
    errors.ts                        # user-friendly AWS error mapping
data/
  app.db                             # SQLite database file
```

## API Surface

### Auth APIs

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### User Management APIs

- `GET /api/users` (admin)
- `POST /api/users` (admin)
- `DELETE /api/users` (admin)

### AWS / EC2 APIs

- `GET /api/ec2/regions`
- `GET /api/ec2/instances?region=<code>`
- `GET /api/ec2/status?instanceId=<id>&region=<code>`
- `GET /api/ec2/metrics?instanceId=<id>&region=<code>`
- `GET /api/ec2/node-exporter?ip=<private-ip>`
- `POST /api/ec2/actions` (admin, supports single + bulk instance IDs)
- `GET /api/ec2/timeline?instanceId=<id>&region=<code>` (admin)
- `GET /api/ec2/export?format=csv|json&region=<code>&state=<state>&search=<term>` (admin)

### Credential API

- `GET /api/aws/credentials`

## Security Model

### Authentication and Session

- Session token is JWT signed with `AUTH_JWT_SECRET`
- Cookie is httpOnly and server-validated on every protected route

### Role-Based Access

- `admin`: can run EC2 actions, timeline, exports, and user management
- `user`: read-focused views only (restricted operations blocked)

### Admin-Only Protections (Backend + Frontend)

- Backend:
  - `/api/ec2/actions` uses `requireSession(request, "admin")`
  - `/api/ec2/timeline` uses `requireSession(request, "admin")`
  - `/api/ec2/export` uses `requireSession(request, "admin")`
- Frontend:
  - Non-admin users see popup on restricted clicks: `Only admin can use this feature.`

### Encryption

- `src/lib/crypto.ts` provides:
  - `encrypt(text: string)`
  - `decrypt(encryptedText: string)`
- Format:
  - `v1.<iv>.<tag>.<issuedAtUnixSeconds>.<cipherText>`
- Supports token expiry checks via `ENCRYPTION_TOKEN_MAX_AGE_SECONDS`
- Secret remains server-only (`ENCRYPTION_SECRET`)

## Data Model (SQLite)

### `users`

- Stores application users and roles
- Auto-seeds initial admin from environment variables

### `instance_action_logs`

- Tracks per-instance operation history:
  - `requested`
  - `success`
  - `failed`
- Captures actor, action, region, timestamp, and metadata JSON
- Indexed by instance + created time for timeline reads

## Feature Details

### EC2 Console Enhancements

- Search by ID/name/type
- State filter
- Sorting by name/state/launch time
- Multi-select with bulk operations (admin)
- Clean selection and refresh behavior

### Host Metrics via node_exporter

- Source: `http://<instance-private-ip>:9100/metrics`
- Fetched server-side by Next.js API route, never directly from the browser
- Cached in-memory for 5 seconds per target host
- Includes lightweight host metrics only:
  - load averages (`node_load1`, `node_load5`, `node_load15`)
  - memory total/free/available
  - swap total/free
  - disk read/write IOPS rates from node_exporter counters
  - network receive/transmit speed with short recent history
  - uptime and OS/kernel details
  - filesystem size/free/free inode table
- Filesystem table supports a `Show all` toggle
- Default filesystem filtering hides noisy mounts:
  - `fstype!~"tmpfs|overlay|squashfs|ramfs|nsfs|autofs|proc|sysfs"`
  - `mountpoint!~"/run.*|/var/lib/docker.*|/snap.*|/boot.*"`

### Metrics Placement in UI

- `Details` tab:
  - OS details
  - kernel version
  - uptime
  - boot time
- `Monitoring` tab:
  - CloudWatch charts
  - load averages
  - memory usage
  - swap usage
  - disk IOPS rate
- `Networking` tab:
  - current network receive/transmit throughput
  - short recent throughput history
- `Storage` tab:
  - block devices
  - filesystem utilization table

### Lifecycle Timeline

- Launch time + current state snapshot
- System/instance status check snapshot
- Scheduled AWS events
- Persisted action history with actor and result status

### Export & Reports

- Export current filtered data as CSV or JSON
- Includes tags, SGs, state, network fields
- Adds `SecurityPosture` hints:
  - `PUBLIC_ENDPOINT`
  - `NO_IAM_ROLE`
  - `NO_SECURITY_GROUP`
  - `OK`

## Environment Variables

### Required

```env
ENCRYPTION_SECRET=replace-with-long-random-secret
AUTH_JWT_SECRET=replace-with-a-long-random-secret
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=replace-with-strong-password
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=ap-south-1
```

### Optional

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

1. Install dependencies

```bash
npm install
```

2. Create environment file

```bash
cp .env.example .env
```

3. Fill required env values in `.env`

4. If you want host metrics from private instance IPs, make those IPs reachable from your local machine.

Example approaches:

- `sshuttle` to route internal subnets through a reachable jump host
- SSH local forwarding for a specific instance metrics endpoint

Example SSH local port forward:

```bash
ssh -L 9100:10.0.0.6:9100 user@jump-host
```

Example `sshuttle` route:

```bash
sshuttle -r user@jump-host 10.0.0.0/8
```

5. Run the application locally

```bash
npm run dev
```

6. Open `http://localhost:3000`

## Docker Setup

This project is intended to run with Docker Compose.

1. Create environment file

```bash
cp .env.example .env
```

2. Fill required env values in `.env`

3. Build the application image

```bash
docker compose build
```

4. Start the stack

```bash
docker compose up -d
```

5. Open `http://localhost:3000`

6. Stop the stack when finished

```bash
docker compose down
```

## Docker Notes

- `Dockerfile` uses a multi-stage production build
- `python3` and `build-essential` are installed only in the build stage for native Node modules such as `better-sqlite3`
- runtime image stays slimmer and only includes production artifacts
- `docker-compose.yaml` persists SQLite data in Docker volume `data`

## node_exporter Connectivity Notes

- The app expects node_exporter to be reachable from the Next.js server at `<private-ip>:9100`
- Browser clients do not connect to node_exporter directly
- For local non-Docker runs, SSH tunneling or `sshuttle` can be used to reach private instance addresses from your workstation
- If private AWS addresses are reachable only through a host tunnel (for example `sshuttle`), container networking must allow that path as well
- Typical deployment expectation is that the app runs in a network context that can reach private instance addresses directly

## Production Recommendations

- Rotate JWT and encryption secrets periodically
- Use IAM least-privilege policies for EC2/CloudWatch access
- Disable mock credential fallback in production
- Keep secrets and decryption strictly server-side
- Never log plaintext AWS secret material
