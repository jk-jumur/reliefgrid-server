# Volunteer, Team, and Task APIs

All endpoints require a Better Auth bearer token.

## Volunteers

Endpoints are under `/api/volunteers`.

- `POST /api/volunteers` creates a profile for the authenticated volunteer, or
  for an active volunteer account when called by a coordinator/admin.
- `GET /api/volunteers` supports `page`, `limit`, `search`, `skill`, and
  `availability`.
- `GET /api/volunteers/:volunteerId` returns a profile and activity history.
- `PATCH /api/volunteers/:volunteerId` updates phone, skills, or availability.

Volunteers can access/update only their own profile; coordinators and system
admins can manage all profiles. The profile account must have the volunteer
role. Assignment workflows control the `assigned` availability state.

## Teams

Endpoints are under `/api/teams`.

- `POST /api/teams` creates a team from available volunteer profile IDs.
- `GET /api/teams` supports `page`, `limit`, `search`, and `status`.
- `GET /api/teams/:teamId` returns team membership and history.
- `PATCH /api/teams/:teamId` updates deployment status and incident assignment.

Team creation atomically marks every member as assigned. Deploying a team
requires an existing incident. A team with assigned or in-progress tasks cannot
be deactivated; deactivation releases its volunteers.

## Tasks and field reports

Endpoints are under `/api/tasks`.

- `POST /api/tasks` assigns a task to an available volunteer or an active team.
  Optional `incidentId` and `emergencyRequestId` links must exist.
- `GET /api/tasks` supports `page`, `limit`, `status`, `incidentId`, and
  `teamId`. Volunteer results are limited to tasks assigned to their profile.
- `GET /api/tasks/:taskId` returns the assignment, status history, and reports.
- `PATCH /api/tasks/:taskId/status` progresses assigned tasks to
  `in_progress` and then `completed`. Coordinators/admins may also cancel tasks.
- `POST /api/tasks/:taskId/reports` lets an assigned volunteer submit report
  text and up to ten photograph URLs.

Volunteer task updates and report submissions are restricted to assigned
volunteers. Task history and field reports remain on completed tasks. Photo
URLs may reference files uploaded through `POST /api/uploads/images`; that
endpoint validates image content and stores files in the server's `uploads/`
directory. Production deployments must configure persistent file storage.
