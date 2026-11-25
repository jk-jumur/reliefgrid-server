# Emergency Request API

All endpoints are under `/api/emergency-requests` and require a Better Auth
bearer token:

```http
Authorization: Bearer <access-token>
```

## Submit a request

`POST /api/emergency-requests`

Allowed roles: `citizen`, `relief_organization`, `emergency_coordinator`,
`system_admin`.

```json
{
  "requestType": "drinking_water",
  "requiredQuantity": 300,
  "location": "Sylhet, Bangladesh",
  "coordinates": {
    "latitude": 24.8949,
    "longitude": 91.8687
  },
  "affectedPeople": 120,
  "description": "Families in the eastern ward need safe drinking water.",
  "urgency": "high",
  "locationRisk": "high"
}
```

`urgency` and `locationRisk` default to `medium`. The authenticated user's ID
and organization ID are recorded, and the server sets submission time, initial
status, calculated priority, and request history. An optional `incidentId` can
link the request to an existing incident.

To prevent accidental duplicate submissions, the server rejects another open
request from the same reporter for the same category within 500 metres and 30
minutes with `409 Conflict`.

## List requests

`GET /api/emergency-requests`

Optional query parameters: `page`, `limit` (maximum `100`), `search`,
`requestType`, `priority`, and `status`. Results are sorted by priority
(critical first), then most recently submitted, and include pagination totals.

Access is scoped by role: citizens see their own requests; relief organizations
see requests they submitted or that are assigned to their organization;
coordinators and system admins can see all requests.

## Get a request

`GET /api/emergency-requests/:requestId`

Returns the request and its history, subject to the same organization and
reporter access rules as the list endpoint.

## Update and assign a request

`PATCH /api/emergency-requests/:requestId`

Emergency coordinators and system admins can update status, priority, urgency,
quantity, affected people, description, rejection reason, coordinator, and
assigned organization. Assignment validates that the coordinator is active and
has the correct role, and that the organization has an active
`relief_organization` user.

Relief organizations can only update the progress of requests assigned to
their own organization, moving them to `in_progress` or `completed`.

Status transitions:

- `pending` → `under_review` or `rejected`
- `under_review` → `verified` or `rejected`
- `verified` → `assigned` or `rejected`
- `assigned` → `in_progress`
- `in_progress` → `completed`

A rejection requires a reason. Completed and rejected requests are immutable.
Status, priority, assignment, and field updates are recorded in request
history; concurrent stale updates receive `409 Conflict`.

## Priority calculation

Priority considers submitted urgency, request type, number of affected people,
location risk, and elapsed time. Medical-supply and rescue requests receive
additional urgency weight. Time adds two points per six hours, up to twenty
points. Scores map to `low` (under 25), `medium` (25–49), `high` (50–74), and
`critical` (75 or more). Active, non-overridden requests are recalculated when
listed or viewed, and automatic priority changes are recorded in history.
