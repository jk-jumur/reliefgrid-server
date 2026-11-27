# Analytics and Data Export APIs

These APIs use records currently stored in MongoDB; they do not return
hard-coded dashboard values. Optional generated demo records are explicitly
labeled and are never loaded automatically.

## Analytics overview

`GET /api/analytics/overview?days=30`

Available to every authenticated role. The endpoint returns aggregate
operational metrics only; it does not expose record-level personal data.
`days` is optional and must be between 1 and 365.

The response contains live counts/totals for active incidents, affected people,
pending requests, available resource units, active/full shelters, volunteer
availability, and distributed resources. It also includes current incident
category counts, daily request submissions in the selected trend window, and
average incident response-start time calculated from recorded incident history.
Average response time is `null` until incidents have a recorded
`in_progress` history event.

## Demand forecast

`GET /api/analytics/demand-forecast?lookbackDays=30&horizonDays=7`

Allowed roles: `emergency_coordinator`, `system_admin`. The forecast groups
persisted emergency requests by category and UTC submission day, then applies
a non-negative daily linear trend over the requested history window. The
response includes observed days, average daily demand, trend, and projected
request count per category. This is a planning estimate, not a guarantee; with
no recorded requests the projection is zero and should not be interpreted as
evidence of no real-world need.

## Export records

`GET /api/exports/:dataset?format=json&limit=1000&from=<ISO>&to=<ISO>`

Datasets: `incidents`, `emergency-requests`, `resources`, and `volunteers`.
Formats: `json` (default) or `csv`. `limit` is capped at 5,000; optional ISO
date bounds filter by record creation/submission time.

Coordinators and system admins can export all records in supported datasets.
Relief organizations can export only their own resources, requests visible to
their organization, and incidents they reported or belong to their
organization. Volunteer records are restricted to coordinators and admins.
CSV output escapes values and protects spreadsheet consumers from formula
injection.

## PDF emergency report

`GET /api/exports/emergency-report.pdf?days=30`

Allowed roles: `emergency_coordinator`, `system_admin`. The downloadable PDF
contains the live analytics summary, active incident category counts, and
recent request trends for a 1–365 day reporting window. It does not expose
reporter names, emails, or free-text descriptions.
