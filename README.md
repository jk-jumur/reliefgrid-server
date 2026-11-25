# ReliefGrid Server

ReliefGrid Server is the Express/TypeScript API for incident response,
emergency requests, resource inventory and distribution, shelters, volunteer
operations, analytics, notifications, and administration. Operational
responses are derived from persisted MongoDB data; the server does not preload
fake/sample records.

## Requirements

- Node.js 22+
- MongoDB 7+
- A MongoDB replica set or sharded cluster for transactional allocation and
  volunteer assignment workflows

## Environment

Create a local `.env` file with:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/reliefgrid?replicaSet=rs0
MONGODB_DATABASE=reliefgrid
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_URL=http://localhost:5000
CLIENT_URL=http://localhost:3000
PORT=5000
```

`MONGODB_URI`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` are required.
`MONGODB_DATABASE` defaults to `reliefgrid`; `CLIENT_URL` and `PORT` also have
defaults. MongoDB Change Streams power the
notification SSE endpoint, so the configured MongoDB replica set or sharded
cluster is required for real-time updates as well as transactional workflows.
Never commit `.env` or use the example secret in a deployed environment.

Email notification delivery uses Resend (`RESEND_API_KEY`,
`RESEND_FROM_EMAIL`); SMS delivery uses Twilio (`TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`). These are optional integrations:
their endpoints return an explicit configuration error until credentials are
provided.

Public sign-up cannot assign privileged roles. To bootstrap the first admin,
first create a normal account through Better Auth, then run this one-time
operator command with that account's email:

```bash
npm run bootstrap:admin -- admin@example.org
```

The command only promotes an existing, active account and refuses to run once
an active system admin exists. Afterward, create organizations and assign
existing accounts using the admin APIs.

## Demo dataset and demo credentials

The canonical database is `reliefgrid`. Synthetic data is never created
automatically. In a development environment, the explicit seed command can
generate a labeled dataset in `reliefgrid`; it refuses production, refuses to
overwrite an existing demo dataset, and does not drop existing user accounts.

```bash
NODE_ENV=development npm run seed:demo -- --confirm-demo-data
```

The command generates 5 organizations, 50 incidents, 100 emergency requests,
20 shelters, 100 volunteers, and 500 resources. Every generated operational
record is marked with `dataOrigin: "generated_demo"`. Credentials are written
once to the ignored, owner-readable `.demo-credentials.json`; do not commit or
share that file. Set `MONGODB_DATABASE=reliefgrid` to run the API against the
canonical dataset. If migrating an earlier demo database, the explicit
consolidation command copies records into `reliefgrid` and leaves the source
untouched until verification:

```bash
NODE_ENV=development npm run consolidate:demo -- --confirm-consolidation
```

With the API running against `reliefgrid`, verify the role-based demo
accounts and representative endpoints without printing their credentials:

```bash
npm run smoke:demo
```

The allocation transaction smoke test creates temporary inventory/request
records in `reliefgrid`, verifies reservation, over-allocation rejection,
role restrictions, and delivery updates, then removes only those temporary
records:

```bash
npm run smoke:allocation
```

## Run and verify

```bash
npm install
npm run dev
```

The API listens on `http://localhost:5000` by default. Check
`GET /api/health`.

```bash
npm run build
npm test
npm start
```

## API areas

- `/api/auth` — Better Auth registration and sign-in
- `/api/incidents`, `/api/emergency-requests`
- `/api/resources`, `/api/resource-allocations`
- `/api/shelters`, `/api/volunteers`, `/api/teams`, `/api/tasks`
- `/api/analytics`, `/api/exports`, `/api/map`
- `/api/notifications`, `/api/activity-logs`
- `/api/organizations`, `/api/admin`
- `/api/uploads/images` — authenticated multipart image upload

System administrators can manage operational settings with
`GET`/`PATCH /api/admin/configurations`. Coordinators and system administrators
can create a task with skill-matched available volunteers through
`POST /api/tasks/auto-assign`. Its JSON body includes the normal task fields,
`requiredSkills` (for example `["medical", "first aid"]`), and `volunteerCount`.
The assignment is committed only if the selected volunteers are still
available. Live SMS and email delivery are deferred; in-app notifications
remain available.

API details, data relationships, and business invariants are documented in the
[`docs/`](./docs/) directory. All operational lists are paginated; critical
writes perform server-side authorization and validation. MongoDB records, not
in-memory fixtures, power dashboards, notifications, activity views, exports,
maps, and reports.

Uploaded images are stored in the local `uploads/` directory, which is ignored
by Git. Deployments must attach persistent storage or replace this local
storage adapter with an object-storage provider.
