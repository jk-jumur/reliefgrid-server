# Data Model and Business Integrity

ReliefGrid stores operational records in MongoDB database `reliefgrid`.
MongoDB `ObjectId` values identify operational documents; relationships to
Better Auth accounts and organizations use their string IDs. The API validates
references and role scope before writes. Do not treat client-supplied IDs or
quantities as trusted.

## Collections and relationships

| Collection | Purpose and key relationships |
| --- | --- |
| `user` | Better Auth accounts and current role, active state, optional SMS phone, and optional `organizationId`. Organization accounts must refer to an active organization. |
| `organizations` | Organization name, region, status, creator, and change history. Its string `_id` is referenced by organization-owned resources, requests, incidents, and accounts. |
| `incidents` | Incident details, coordinates, severity, calculated/overridden priority, assigned coordinator, reporter and optional organization. `incidentHistory` records reports, updates, status, coordinator, and priority changes. |
| `emergencyRequests` | Request category, quantity, urgency, location, requester and optional incident/organization assignments. `requestHistory` records status, assignment, and priority changes; allocated/delivered quantities track fulfillment. |
| `resources` | Organization-owned stock, with available, allocated, and distributed quantities. `stockHistory` records each stock or allocation movement. |
| `resourceAllocations` | Links one emergency request, resource, and responsible organization. `history` records distribution-state changes; QR-confirmed deliveries record verifier and verification time. Allocation updates also change resource and request quantities transactionally. |
| `distributionVerifications` | Stores hashed, expiring, one-time QR tokens; token consumption is committed atomically with allocation delivery. |
| `shelters` | Capacity, occupancy, facilities, coordinates, manager, and status. Occupancy changes are stored in `occupancyHistory`; general changes are stored in `activityHistory`. |
| `volunteers` | Volunteer profile linked to a Better Auth account through `userId`; skills, availability, and profile history. |
| `teams` | Team membership references volunteer profile IDs; optional incident assignment and status changes are stored with team history. |
| `tasks` | Volunteer/team assignments, optional incident/request references, task status history, automatic-matching criteria when applicable, and embedded field reports with photo URLs. Completed tasks retain their reports and history. |
| `platformConfigurations` | One `global` document stores request duplicate-detection and volunteer-matching limits, revision metadata, and a capped change history. |
| `notificationReceipts` | Per-user read state keyed by user and notification ID. Notification content itself is computed from current operational records. |
| `notificationDeliveries` | Per-user email/SMS delivery state keyed by notification and channel. Message bodies and provider credentials are not stored. |

Activity logs are a read-time projection of persisted module histories; they
are not a second, independently mutable copy of operational events. Uploaded
image bytes are stored in the local `uploads/` directory during development or
in Vercel Blob when deployed there; image bytes are not stored in MongoDB.

## Integrity invariants

### Authorization and organization scope

- Every protected request verifies the JWT and then reloads the account's
  current role, active state, and organization assignment from MongoDB.
- Organization users can access only their own organization-owned records and
  explicitly assigned operational work.
- Only system administrators manage organization and account access.
- Only system administrators can read or update platform configuration. Updates
  use revision checks and record the changed settings and actor in history.
- Volunteers can update only tasks assigned to their volunteer profile.
- A suspended organization or inactive account cannot continue using protected
  endpoints with an old token.

### Inventory and allocation

- Inventory is represented as non-negative `availableQuantity`,
  `allocatedQuantity`, and `distributedQuantity`.
- Allocation creation reserves available stock and updates the linked
  request's allocated quantity in a MongoDB transaction.
- A conditional stock update prevents concurrent allocations from reserving
  more than the remaining quantity.
- If any transaction step fails, the allocation, request, and inventory
  changes roll back together.
- Cancellation restores reserved stock; dispatch/delivery transitions move
  quantities through the appropriate inventory and request fields.
- Every successful stock or allocation transition appends history in the same
  transaction as the corresponding state change.

### Shelter capacity

- `availableCapacity` is derived from `totalCapacity - currentOccupancy`.
- An occupancy increase is conditional on the shelter remaining active and
  having sufficient capacity; departures cannot reduce occupancy below zero.
- Capacity cannot be reduced below current occupancy.
- Occupancy and its immutable history entry are written atomically.

### Priority and operational history

- Incident and request priority is computed server-side from severity or
  urgency, affected population, location risk, and elapsed time.
- Priority-based sorting uses the calculated priority score; authorized
  overrides are recorded in history rather than silently replacing the
  calculated value.
- Status transitions are checked against each module's allowed state flow.
- History timestamps and actor IDs are generated by the server.

### Request duplicate detection and volunteer matching

- Duplicate emergency-request detection uses the configured time window and
  geographic radius; defaults are 30 minutes and 500 meters.
- Automatic task assignment selects only available volunteer profiles with
  matching skills, covers all requested skills, and respects the configured
  maximum team size and candidate-pool limit.
- Task creation rechecks volunteer availability and reserves the selected
  profiles in the same MongoDB transaction, so concurrent assignments cannot
  reserve the same volunteer twice.

## Indexing and deployment

Feature services create indexes for common organization/status, assignment,
and list queries, plus unique volunteer-account, notification-receipt,
notification-delivery, and QR-token keys.
The deployment account must be allowed to create indexes on first use.

MongoDB transactions and Change Streams require a replica set or sharded
cluster. Use a persistent volume or object storage for uploaded files in
production; the local `uploads/` directory is intended for development.
