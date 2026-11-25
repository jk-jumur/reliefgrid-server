# Incident API

All endpoints are under `/api/incidents` and require a Better Auth bearer token:

```http
Authorization: Bearer <access-token>
```

## Report an incident

`POST /api/incidents`

Allowed roles: `citizen`, `relief_organization`, `emergency_coordinator`, `system_admin`.

```json
{
  "title": "Riverbank flooding",
  "description": "Water has entered homes near the river. Several families need evacuation support.",
  "category": "flood",
  "location": "Sylhet, Bangladesh",
  "coordinates": {
    "latitude": 24.8949,
    "longitude": 91.8687
  },
  "locationRisk": "high",
  "severity": "high",
  "affectedPopulation": 240,
  "imageUrl": "https://example.org/incident-photo.jpg"
}
```

`locationRisk` defaults to `medium`. The authenticated user's ID and organization
ID are recorded as the reporter and organization. The server initializes the
status and incident history and calculates the initial priority.

## List incidents

`GET /api/incidents`

Optional query parameters:

| Parameter | Description |
| --- | --- |
| `page` | 1-based page number; defaults to `1` |
| `limit` | Page size from `1` to `100`; defaults to `20` |
| `search` | Case-insensitive search across title, description, and location |
| `category` | `flood`, `cyclone`, `earthquake`, `fire`, `landslide`, `infrastructure_failure` |
| `severity` | `low`, `medium`, `high`, `critical` |
| `priority` | `low`, `medium`, `high`, `critical` |
| `status` | `reported`, `under_review`, `verified`, `in_progress`, `resolved`, `closed` |

Results are ordered by priority (critical first), then most recently created.
The response contains `data` and `pagination` (`page`, `limit`, `total`, and
`totalPages`).

## Get incident details

`GET /api/incidents/:incidentId`

The response includes the incident and its history.

## Update an incident

`PATCH /api/incidents/:incidentId`

Allowed roles: `emergency_coordinator`, `system_admin`. At least one supported
field is required. Supported fields include incident details, severity,
affected population, location risk, priority, status, image URL, and
`assignedCoordinator`.

When assigning a coordinator, the server verifies the user exists, is active,
and has the `emergency_coordinator` role. Status transitions are checked by the
server. Closed incidents are immutable. Status, priority, coordinator, and
detail changes are appended to `incidentHistory`; concurrent stale updates
receive `409 Conflict`.

## Priority calculation

Automatic priority uses severity, affected-population bands, location risk, and
time unresolved. Time adds two points for every six hours, up to twenty points.
Scores map to `low` (under 25), `medium` (25–49), `high` (50–74), and `critical`
(75 or more). Active, non-overridden incidents are recalculated during list and
detail reads; each automatic priority change is recorded in history. A
coordinator may set a manual priority, which is preserved from automatic
recalculation.

## Current limitation

`imageUrl` accepts an existing URL; multipart image upload and storage have not
been added yet.
