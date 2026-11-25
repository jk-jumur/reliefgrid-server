# Shelter API

All endpoints are under `/api/shelters` and require a Better Auth bearer token.

## Register a shelter

`POST /api/shelters`

Allowed roles: shelter managers, emergency coordinators, and system admins.
A shelter manager is automatically assigned to shelters they create.

```json
{
  "name": "North Community Shelter",
  "location": "Sylhet, Bangladesh",
  "coordinates": {
    "latitude": 24.8949,
    "longitude": 91.8687
  },
  "totalCapacity": 300,
  "facilities": ["clean water", "first aid", "accessible washrooms"],
  "shelterManagerId": "active-shelter-manager-user-id"
}
```

`shelterManagerId` is optional and, when provided, must identify an active
shelter manager. New shelters start with zero occupancy and calculated
available capacity.

## List and view shelters

- `GET /api/shelters` supports `page`, `limit`, `search`, and `status`.
- `GET /api/shelters/:shelterId` returns shelter details and occupancy history.
- `GET /api/shelters/reports` returns aggregate capacity/occupancy totals and
  per-shelter summaries.

Coordinators and system admins can access all shelters. Shelter managers can
access only shelters assigned to their user account. Coordinates are returned
for map visualization.

## Update shelter details

`PATCH /api/shelters/:shelterId` updates name, location, coordinates, facilities,
capacity, manager, or status. Total capacity cannot be lowered below current
occupancy. Manager assignments must reference active shelter-manager accounts.
Shelter status may be `active`, `inactive`, or `under_maintenance`; `full` is
derived from occupancy.

## Report occupancy

`POST /api/shelters/:shelterId/occupancy`

```json
{
  "occupancyChange": 24,
  "reason": "Families relocated from the eastern ward"
}
```

Use a positive integer to increase occupancy or a negative integer to record
departures. Occupancy cannot become negative or exceed total capacity, and
occupancy can only increase at an active shelter. The server updates available
capacity and full/active status atomically and appends an immutable
occupancy-history entry. Concurrent or stale reports receive `409 Conflict`.
