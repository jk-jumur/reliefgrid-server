# Administration, Activity, and Notifications

Operational API data is read from MongoDB. Synthetic demo data is never
generated automatically; the opt-in development seed command writes labeled
records to `reliefgrid` and refuses to run in production or overwrite existing
operational data.

## Organizations

System admins manage organizations under `/api/organizations`:

- `POST /api/organizations` creates an active organization (`name`,
  `description`, `region`).
- `GET /api/organizations` supports `page`, `limit`, `search`, and `status`.
- `PATCH /api/organizations/:organizationId` updates profile data or sets
  status to `active`/`suspended`.

Relief-organization accounts must be assigned to an active organization.
Suspending an organization blocks its members from authenticated API access.

## User access management

System admins manage existing Better Auth accounts under `/api/admin/users`:

- `GET /api/admin/users` supports `page`, `limit`, `search`, `role`, and
  `isActive`.
- `GET /api/admin/users/:userId` returns a safe user projection.
- `PATCH /api/admin/users/:userId` changes `role`, `organizationId`, and/or
  `isActive`.

Only active organizations may be assigned to relief-organization users.
Passwords and authentication secrets are never included in the user response.
Role, account status, and organization status are revalidated from MongoDB on
every authenticated API request, so changes take effect without waiting for a
JWT to expire.

## Activity log

`GET /api/activity-logs?page=1&limit=20&entityType=task&actorId=<user-id>`

Emergency coordinators and system admins can search activity history with
optional ISO `from`/`to` date bounds. The endpoint builds a paginated,
chronologically sorted audit feed from incident/request histories, stock and
allocation movements, shelter occupancy reports, and volunteer/team/task
histories. It reflects persisted operational events rather than sample events.

## Notifications and real-time updates

- `GET /api/notifications` returns current action-required records for the
  authenticated role, with each user's read state.
- `PATCH /api/notifications/:notificationId/read` saves a per-user read receipt.
- `POST /api/notifications/:notificationId/deliver` sends an existing
  notification to the authenticated user's own email and/or phone. Example:
  `{"channels":["email","sms"]}`. Email uses Resend; SMS uses Twilio and
  requires the user's phone number in E.164 format. Provider credentials are
  optional at startup; sending returns HTTP 503 until the requested provider
  is configured. Per-channel attempts are audited without storing message
  bodies, successful sends cannot be duplicated, and failed sends may be retried.
  Partial provider failures return HTTP 207 with per-channel results.
- `GET /api/notifications/stream` opens a Server-Sent Events stream. The stream
  listens to MongoDB Change Streams and emits an `operations_changed` event
  for persisted operational updates, plus newly applicable alerts. Clients
  should refetch their authorized resources after an `operations_changed`
  event. This requires a MongoDB replica set or sharded cluster.

Alerts are derived dynamically from incidents, requests, stock, shelters,
allocations, and assigned tasks. No notification fixtures are preloaded.
