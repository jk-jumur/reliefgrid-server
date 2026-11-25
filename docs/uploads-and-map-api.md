# Image Upload and Map APIs

## Upload images

`POST /api/uploads/images` accepts multipart form data with a `files` field.
Authenticated users may upload up to ten JPEG, PNG, or WebP images per request;
each image is limited to 5 MB.

The response contains a relative `/uploads/<generated-name>` URL for each
stored file. Use that URL as an incident `imageUrl` or a task field-report
`photoUrls` entry. Files are stored under the server's ignored `uploads/`
directory and served as static images. Production deployments need persistent
file storage.

## Operations map

`GET /api/map/operations?limit=500&south=24&west=90&north=26&east=92`

Returns live, geolocated active incidents, open emergency requests, operational
shelters, and assigned tasks. Map bounds are optional but must be supplied
together; the server validates latitude/longitude ranges. Each layer is capped
by `limit` (maximum 1,000).

Data access follows the authenticated role: volunteers see their assigned
tasks, shelter managers see their shelters, citizens see their own requests,
and organizations see their own/assigned requests and incidents. Coordinators
and admins can map all active response records.

## Nearest available shelters

`GET /api/shelters/nearest?latitude=24.9&longitude=91.9&people=20`

Returns up to ten active shelters with enough available capacity, ordered by
calculated geographic distance.
