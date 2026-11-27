# Resources and Allocations API

All endpoints require a Better Auth bearer token:

```http
Authorization: Bearer <access-token>
```

## Resources

Resource endpoints are under `/api/resources`.

### Register a resource

`POST /api/resources`

Allowed roles: `relief_organization`, `system_admin`.

```json
{
  "name": "Drinking water packs",
  "category": "drinking_water",
  "availableQuantity": 500,
  "storageLocation": "Sylhet central warehouse"
}
```

Relief organizations are automatically scoped to their own organization.
System admins must provide `organizationId`. The server initializes available,
allocated, and distributed quantities and records stock history.

### List and view resources

- `GET /api/resources` — paginated inventory; optional `page`, `limit`,
  `search`, `category`, and `availability` filters.
- `GET /api/resources/:resourceId` — resource details and stock history.

Relief organizations see and manage their own inventory. Coordinators can view
all inventory; system admins can manage all organizations' inventory.

### Update resource details and stock

- `PATCH /api/resources/:resourceId` accepts `name` and/or `storageLocation`.
- `POST /api/resources/:resourceId/movements` records a `restock` or
  `withdrawal` with a positive whole-number `quantity` and a required `reason`.

Stock changes are concurrency-checked and append a stock-history record.
Withdrawals cannot exceed currently available stock. Availability is derived
from available, allocated, and distributed quantities.

## Resource allocations

Allocation endpoints are under `/api/resource-allocations`. Relief
organizations can operate only on their own allocation records; emergency
coordinators and system admins can access all allocations.

### Allocate inventory

`POST /api/resource-allocations`

```json
{
  "emergencyRequestId": "64f000000000000000000001",
  "resourceId": "64f000000000000000000002",
  "organizationId": "relief-org-identifier",
  "allocationQuantity": 100
}
```

Allocations are available to verified or assigned requests. The server checks
that the organization's resource category is compatible with the request,
that stock and remaining request quantity are sufficient, and that an
assignment does not conflict with another organization. A MongoDB transaction
reserves stock, updates the request's allocated quantity and assignment, and
creates the allocation with history atomically.

### List and view allocations

- `GET /api/resource-allocations` — paginated results; optional `page`, `limit`,
  case-insensitive `search`, `status`, `emergencyRequestId`, and `resourceId`.
  Search covers the allocation status, linked request type/location/description,
  resource name/category/storage location, and organization name/region.
- `GET /api/resource-allocations/:allocationId` — allocation and status history.
- `POST /api/resource-allocations/:allocationId/verification-qr` — create a
  one-time QR for an `in_transit` allocation. Relief organizations may issue
  codes for their own allocations; coordinators and admins may issue any code.
  The response contains a PNG data URL, a verification token, and a 24-hour
  expiry. A newly issued code invalidates previous unused codes.
- `POST /api/resource-allocations/verify-delivery` — body
  `{"token":"<verificationToken>"}`. The requesting citizen, a coordinator, or
  an admin can verify delivery. Token consumption, inventory distribution,
  request progress, and allocation history update in one MongoDB transaction;
  expired or replayed codes are rejected.

### Update distribution status

`PATCH /api/resource-allocations/:allocationId`

```json
{
  "status": "approved"
}
```

Allowed transitions:

- `pending` → `approved` or `cancelled`
- `approved` → `preparing` or `cancelled`
- `preparing` → `dispatched` or `cancelled`
- `dispatched` → `in_transit`
- `in_transit` → `delivered`
- `delivered` → `completed`

Only coordinators and system admins may approve or cancel. Cancellation
restores reserved stock; delivery moves reserved quantity into distributed
stock and updates request progress. Status changes, inventory changes, request
quantity changes, and history entries are committed atomically. MongoDB
transactions require a replica set or sharded cluster.
