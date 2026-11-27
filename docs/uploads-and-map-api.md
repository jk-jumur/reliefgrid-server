# Image Upload and Map APIs

## Upload images

`POST /api/uploads/images` accepts multipart form data with a `files` field.
Authenticated users may upload up to ten JPEG, PNG, or WebP images per request;
each image is limited to 5 MB.

The response contains a URL for each stored file. Local development returns a
relative `/uploads/<generated-name>` URL; these files are served from the
server's ignored `uploads/` directory. When `BLOB_READ_WRITE_TOKEN` is
configured, uploads are stored in a public Vercel Blob store and return its
absolute HTTPS URL. Vercel deployments require this persistent Blob storage
configuration.

Use the returned URL as an incident `imageUrl` or a task field-report
`photoUrls` entry. Image contents are checked against the declared JPEG, PNG,
or WebP media type before storage.

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
