# LWC Data Server

An HTTP/JSON API serving water-quality and watershed field data for the LWC
project. It is a thin, secured layer in front of a PostgreSQL (AWS RDS) database,
built with Express 5, Prisma 7, and TypeScript.

This README is written for **front-end developers and AI agents** building UIs on
top of this data. It documents what endpoints exist, the exact shape of every
response, the data domain (water-quality / cyanobacteria monitoring), and how to
run the server locally.

---

## TL;DR for front-end / agent consumers

- **Base URL:** `http://<host>:<PORT>`. The code default is `3000`, but the
  bundled `.env`/`.env.example` set `PORT=3001`, so local examples use `3001`.
- **Auth:** role-based JWT. Log in at `POST /auth/login` to get a token, then
  send it as `Authorization: Bearer <token>` on protected requests.
- **Roles:** three levels — `guest` (unauthenticated), `volunteer`, `admin`.
  See the [permission table](#roles--permissions) for what each can do.
- **CORS:** the browser origin must be in the server's allowlist
  (`CORS_ALLOWED_ORIGINS`). Ask whoever runs the server to add yours.
- **Data endpoints:** two datasets are served, each with full `GET`/`POST`/
  `PATCH`/`DELETE`:
  - **PMN** — `/api/pmn/combined-field-data` (cyanobacteria field data).
  - **Phosphate** — `/api/phosphate-data` (watershed lab phosphate results, each
    row joined to its sampling `location`).
- **Image uploads:** volunteers and admins can upload up to 10 images at a time
  via presigned S3 URLs — see [Image uploads](#image-uploads-apiuploads).
- **Scum photos (PMN):** PMN records can be flagged `has_scum` and carry
  `scum_photos` (upload ids). Scum photos are **publicly viewable** (no login) via
  [`GET /api/pmn/scum-photos/:uploadId/url`](#get-apipmnscum-photosuploadidurl) —
  the one exception to volunteer-only upload access.
- **Health probe:** `GET /health` is public (no auth, no rate limit).
- **Success shape:** `{ "data": <payload>, "message"?: "...", "meta"?: { ... } }`.
  **Error shape:** `{ "error": { "message": "...", "code": "...", "details"?: ...,
  "requestId": "..." } }`. `data` and `error.message` are unchanged from earlier
  versions; `message`, `meta`, `code` and `details` were added alongside them, so
  existing clients keep working. **New clients should branch on `error.code`**, not
  on the message text — see [Error codes](#error-codes). Error bodies never include
  DB details, SQL, or stack traces.
- **Request ids:** every response carries an `X-Request-Id` header, and every error
  body repeats it as `error.requestId`. Quote it when reporting a `500` — it is the
  key to the matching server-side log entry. Clients may supply their own via the
  same header; it is honored only if it matches `[A-Za-z0-9_-]{8,64}`.
- **`GET /health` is the one un-enveloped response** — it returns
  `{ "status", "uptime", "timestamp" }` directly so load-balancer probes and
  monitors can parse it without unwrapping.
- **Numbers come back as strings.** PostgreSQL `DECIMAL` columns serialize as
  JSON strings (e.g. `"7.40"`), not numbers. Parse them client-side.
- **Dates/times are ISO timestamps.** `DATE` and `TIME` columns serialize as full
  ISO-8601 strings with an epoch placeholder for the missing half — see
  [Field types & gotchas](#field-types--gotchas).

---

## Roles & permissions

| Role | GET data | POST data | PATCH data | DELETE data | Upload images | Manage users |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| **guest** (no token) | ✓ | — | — | — | — | — |
| **volunteer** | ✓ | ✓ | — | — | ✓ | — |
| **admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Guests need no credentials — unauthenticated GET requests are always allowed.
Guests cannot view uploaded images in general, but they **can** view PMN scum
photos (see [`GET /api/pmn/scum-photos/:uploadId/url`](#get-apipmnscum-photosuploadidurl)).
Volunteers and admins authenticate via `POST /auth/login` and send the returned
JWT as a Bearer token.

---

## API reference

### `POST /auth/login`

Public. Exchange email + password for a JWT.

**Body:**
```json
{ "email": "user@example.com", "password": "..." }
```

**Response `200`:**
```json
{
  "data": {
    "token": "<jwt>",
    "user": { "id": "<uuid>", "email": "user@example.com", "roles": ["volunteer"] }
  }
}
```

**Response `200`** also carries `"message": "Signed in."`.

**Response `400`:** `MISSING_FIELD` —
`{ "error": { "message": "email and password are required", ... } }`

**Response `401`:** `INVALID_CREDENTIALS` —
`{ "error": { "message": "Invalid email or password", ... } }`. Returned
identically for an unknown email and a wrong password, so the endpoint cannot be
used to discover which addresses are registered.

**Response `403`:** `ACCOUNT_INACTIVE` —
`{ "error": { "message": "Account is inactive", ... } }`

---

### `GET /health`

Public, unauthenticated, not rate-limited. Intended for load-balancer probes.

```json
{
  "status": "ok",
  "uptime": 1234.56,
  "timestamp": "2026-06-18T20:00:00.000Z"
}
```

---

### `GET /api/pmn/combined-field-data`

Returns every row of the `pmn_combined_field_data` table (no pagination or
sorting yet — see [Roadmap](#roadmap--known-gaps)).

**Auth:** none required (guest access).

**Query parameters:**

| Param | Values | Effect |
| --- | --- | --- |
| `hasScum` | `true` \| `false` | Optional. Return only records whose `has_scum` matches. Omit to return all rows. |

**Response `400`:** `INVALID_FIELD` —
`{ "error": { "message": "hasScum must be true or false", ... } }` for any other
`hasScum` value.

**Response `200`** also carries `"message": "Retrieved PMN combined field data."`
and `"meta": { "count": <n> }`, plus `"meta".filters.hasScum` when the filter is
applied.

**Response `200`:**

```json
{
  "data": [
    {
      "id": "b50a0722-0f82-489c-9b12-45825e07b949",
      "sample_date": "2026-05-01T00:00:00.000Z",
      "sample_time": "1970-01-01T08:30:00.000Z",
      "sampling_site": "North Cove",
      "air_temperature": "14.2",
      "weather": "Partly Cloudy",
      "wind_direction": "NW",
      "wind_speed": "5-10 mph",
      "barometeric_pressure": "1013.2",
      "water_temperature": "12.8",
      "ph": "7.4",
      "dissolved_oxygen": "9.1",
      "conductivity": "245",
      "total_dissolved_solids": "163",
      "salt_ppt": "0.12",
      "aphanizomenon": "None",
      "dolichospermum": "None",
      "microcystis": "None",
      "planktothrix": "None",
      "raphidiopsis": "None",
      "woronichinia": "None",
      "secchi": "1.8",
      "general_comments": "Calm conditions, good visibility.",
      "photos": [],
      "has_scum": false,
      "scum_photos": []
    }
  ]
}
```

Every field except `id` and `has_scum` may be `null`. Treat all measurement fields as nullable
in the UI. See the [field table](#pmn_combined_field_data-the-served-table) for
types and meaning.

---

### `POST /api/pmn/combined-field-data`

Creates a new record. The database assigns the UUID — do not send `id` in the
body.

**Auth:** volunteer or admin (`Authorization: Bearer <token>`).

**Body:** any subset of the fields in the table (all are optional — an empty
`{}` is valid; all nullable fields default to `null`, `photos` and `scum_photos`
default to `[]`, `has_scum` defaults to `false`).

```json
{
  "sample_date": "2026-07-01T00:00:00.000Z",
  "sample_time": "1970-01-01T09:00:00.000Z",
  "sampling_site": "North Cove",
  "ph": 7.5,
  "dissolved_oxygen": 8.9
}
```

**Response `201`:** the created record as `{ "data": { ... } }`,
with `"message": "PMN record created."` and `"meta": { "id": "<uuid>" }`.

**Response `400`:** `PMN_SCUM_RULE_VIOLATION` — a scum validation error (see
[Scum rules](#scum-rules)), e.g.
`{ "error": { "message": "Every scum photo must be a confirmed image upload", ... } }`.
`details.field` names the offending field.

#### Scum rules

`has_scum` and `scum_photos` are validated on POST and PATCH. Violations return
`400` with a descriptive message:

- `has_scum` must be a boolean.
- `scum_photos` must be an array of upload UUIDs, at most **10** per record.
- A non-empty `scum_photos` means `has_scum` is `true`. If you omit `has_scum`,
  the server sets it to `true` for you; sending `has_scum: false` alongside scum
  photos is rejected.
- `has_scum: true` with no photos is allowed (scum seen, no photo taken).
- An upload id cannot appear in both `photos` and `scum_photos`.
- Every scum photo must be a **confirmed** `image/*` upload (upload it through
  [`/api/uploads`](#image-uploads-apiuploads) and confirm it first). Adding an id
  to `scum_photos` makes that image **publicly viewable**.

---

### `PATCH /api/pmn/combined-field-data/:id`

Partially updates an existing record. Only the fields present in the body are
changed; omitted fields are left as-is.

**Auth:** admin only (`Authorization: Bearer <token>`).

**Body:** any subset of mutable fields.

The [scum rules](#scum-rules) are checked against the record **after** the patch
is applied. So `{ "has_scum": false }` on its own fails while the record still has
scum photos. To clear scum, send `{ "has_scum": false, "scum_photos": [] }`.

**Response `200`:** the updated record as `{ "data": { ... } }`,
with `"message": "PMN record updated."` and `"meta": { "id": "<uuid>" }`.

**Response `400`:** `PMN_SCUM_RULE_VIOLATION` — a scum validation error.

**Response `404`:** `PMN_RECORD_NOT_FOUND` — `{ "error": { "message": "Record not found", ... } }` if `id`
does not match any row.

---

### `DELETE /api/pmn/combined-field-data/:id`

Deletes a record by UUID.

**Auth:** admin only (`Authorization: Bearer <token>`).

**Response `204`:** no body.

**Response `404`:** `PMN_RECORD_NOT_FOUND` — `{ "error": { "message": "Record not found", ... } }` if `id`
does not match any row.

---

### `GET /api/pmn/scum-photos/:uploadId/url`

Public. Gets a short-lived presigned S3 GET URL for a scum photo, so the front end
can show scum photos to users who are not logged in.

**Auth:** none required (guest access).

The URL is only issued while at least one PMN record lists `uploadId` in its
`scum_photos`. Once no record references it (e.g. an admin clears the scum
photos), this endpoint returns `404` again. For any other image, use the
authenticated [`GET /api/uploads/:id/url`](#get-apiuploadsidurl).

**Response `200`:** same shape as `GET /api/uploads/:id/url`, plus
`"message": "Scum photo URL issued."` and `"meta": { "expiresInSeconds": 900 }`:
```json
{
  "data": {
    "url": "https://s3.amazonaws.com/...",
    "contentType": "image/jpeg",
    "originalName": "scum.jpg"
  }
}
```

The URL expires in **15 minutes**.

**Response `400`:** `INVALID_ID` — `{ "error": { "message": "Invalid id", ... } }` if `:uploadId` is
not a valid UUID.

**Response `404`:** `PMN_SCUM_PHOTO_NOT_FOUND` — `{ "error": { "message": "Scum photo not found", ... } }`,
with no `details` (an unknown upload and a non-scum upload are deliberately
indistinguishable). This is
returned both for ids that don't exist and for uploads that aren't scum photos,
so the endpoint doesn't reveal which upload ids exist.

---

### `GET /api/phosphate-data`

Returns **every row** of the `watershed_field_data.phosphate_data` table, each
with its related sampling `location` joined in as a nested `locations` object (no
pagination, filtering, or sorting yet — see [Roadmap](#roadmap--known-gaps)).

**Auth:** none required (guest access).

**Response `200`:**

```json
{
  "data": [
    {
      "id": "b50a0722-0f82-489c-9b12-45825e07b949",
      "lab_case_file_number": 1001,
      "loc_id": "11111111-1111-1111-1111-111111111111",
      "measurement_date": "2026-07-01T00:00:00.000Z",
      "measurement_time": "1970-01-01T09:30:00.000Z",
      "analysis_date": "2026-07-02T00:00:00.000Z",
      "analyte_id": "PO4",
      "analyte_level": 0.35,
      "unit": "mg/L",
      "notes": "Grab sample, north inlet.",
      "photos": [],
      "locations": {
        "loc_id": "11111111-1111-1111-1111-111111111111",
        "loc_name": "Lacamas Lake — North Inlet",
        "latitude": 45.6,
        "longitude": -122.4,
        "description": "Inflow monitoring point."
      }
    }
  ]
}
```

Note: unlike the PMN table, `phosphate_data`'s numeric columns are Postgres
`double precision` (Prisma `Float`), so `analyte_level`, `latitude`, and
`longitude` come back as JSON **numbers**, not strings. `measurement_date` /
`analysis_date` are `DATE` and `measurement_time` is `TIME` — same ISO-with-epoch
serialization described in [Field types & gotchas](#field-types--gotchas). See the
[field table](#watershed_field_dataphosphate_data-served-with-locations-joined).

---

### `POST /api/phosphate-data`

Creates a new phosphate record. The database assigns the UUID — do not send `id`
in the body.

**Auth:** volunteer or admin (`Authorization: Bearer <token>`).

**Body:** send a **flat `loc_id`** (the UUID of an existing `locations` row); the
server maps it to the underlying relation. All other columns except `notes` and
`photos` are required (`photos` defaults to `[]` when omitted).

```json
{
  "loc_id": "11111111-1111-1111-1111-111111111111",
  "lab_case_file_number": 1001,
  "measurement_date": "2026-07-01T00:00:00.000Z",
  "measurement_time": "1970-01-01T09:30:00.000Z",
  "analysis_date": "2026-07-02T00:00:00.000Z",
  "analyte_id": "PO4",
  "analyte_level": 0.35,
  "unit": "mg/L",
  "notes": "Grab sample, north inlet.",
  "photos": []
}
```

**Response `201`:** the created record as `{ "data": { ... } }`,
with `"message": "Phosphate record created."` and `"meta": { "id": "<uuid>" }`.

**Response `400`:** `MISSING_FIELD` if `loc_id` is absent, `INVALID_ID` if it is
not a UUID, or `PHOSPHATE_LOCATION_UNKNOWN` —
`{ "error": { "message": "No sampling location matches the loc_id provided.", ... } }`
if no `locations` row has that id. These previously surfaced as `500`s.

---

### `PATCH /api/phosphate-data/:id`

Partially updates an existing record. Only the fields present in the body are
changed. To move the record to a different sampling site, include a flat
`loc_id` — the server maps it to the relation.

**Auth:** admin only (`Authorization: Bearer <token>`).

**Response `200`:** the updated record as `{ "data": { ... } }`,
with `"message": "Phosphate record updated."` and `"meta": { "id": "<uuid>" }`.

**Response `400`:** as for `POST`, when `loc_id` is present in the body.

**Response `400`:** `INVALID_ID` — `{ "error": { "message": "Invalid id", ... } }` if `:id` is not a
valid UUID.

**Response `404`:** `PHOSPHATE_RECORD_NOT_FOUND` — `{ "error": { "message": "Record not found", ... } }` if `id`
does not match any row.

---

### `DELETE /api/phosphate-data/:id`

Deletes a phosphate record by UUID.

**Auth:** admin only (`Authorization: Bearer <token>`).

**Response `204`:** no body.

**Response `400`:** `INVALID_ID` — `{ "error": { "message": "Invalid id", ... } }` if `:id` is not a
valid UUID.

**Response `404`:** `PHOSPHATE_RECORD_NOT_FOUND` — `{ "error": { "message": "Record not found", ... } }` if `id`
does not match any row.

---

### Image uploads (`/api/uploads`)

All upload endpoints require at minimum a volunteer JWT. (Exception: PMN scum
photos can be viewed publicly through
[`GET /api/pmn/scum-photos/:uploadId/url`](#get-apipmnscum-photosuploadidurl).)

#### `POST /api/uploads/presigned-urls`

Request presigned S3 PUT URLs for up to 10 images. The client uploads each file
directly to S3 using the returned URL — the file never passes through this server.

**Auth:** volunteer or admin.

**Body:**
```json
{
  "files": [
    { "filename": "photo.jpg", "contentType": "image/jpeg", "sizeBytes": 204800 },
    { "filename": "site.png",  "contentType": "image/png",  "sizeBytes": 512000 }
  ]
}
```

- `files` must be a non-empty array with at most 10 entries.
- Allowed `contentType` values: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- `sizeBytes` must be between 1 byte and 10 MB (10,485,760 bytes). This is a
  declared size — the server validates it, and the S3 PUT will fail for any file
  exceeding the limit enforced by the bucket policy.

Each of the above produces a `400` with code `INVALID_FIELD` (or `INVALID_ID` for a
malformed upload id), a message naming the offending file or field, and a
`details` object carrying the allowed values.

**Response `201`** also carries `"message": "Upload URLs issued."` and
`"meta": { "count": <n>, "expiresInSeconds": 300 }`:
```json
{
  "data": [
    {
      "uploadId": "<uuid>",
      "presignedUrl": "https://s3.amazonaws.com/...",
      "objectKey": "uploads/<userId>/<uuid>.jpg"
    }
  ]
}
```

The `presignedUrl` expires in **5 minutes**. PUT the raw file bytes directly to
that URL with the matching `Content-Type` header — no multipart encoding.

```bash
curl -X PUT "<presignedUrl>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg
```

After the PUT succeeds, call `POST /api/uploads/confirm` to mark the records
confirmed in the database.

---

#### `POST /api/uploads/confirm`

Mark one or more uploads as confirmed after the S3 PUT succeeds. Only the
authenticated user's own pending uploads are updated — passing another user's
IDs has no effect.

**Auth:** volunteer or admin.

**Body:**
```json
{ "uploadIds": ["<uuid>", "<uuid>"] }
```

**Response `200`:**
```json
{
  "data": { "confirmed": 1 },
  "message": "Confirmed 1 of 2 uploads.",
  "meta": { "requested": 2, "confirmed": 1, "skipped": 1 }
}
```

`confirmed` is the count of records actually updated (pending → confirmed). IDs
that are already confirmed, don't exist, or belong to another user are skipped
rather than rejected, so **a partial confirm is still a `200`**. Compare
`meta.confirmed` against `meta.requested` — or read `meta.skipped` — to detect a
shortfall; the message states both counts. `data` keeps its original shape.

---

#### `GET /api/uploads/:id/url`

Get a short-lived presigned S3 GET URL for a single upload, plus its content type
and original filename. Any volunteer or admin can request any upload's URL (e.g.
to view photos attached to another volunteer's record).

**Auth:** volunteer or admin.

**Response `200`:**
```json
{
  "data": {
    "url": "https://s3.amazonaws.com/...",
    "contentType": "image/jpeg",
    "originalName": "sample-1.jpg"
  }
}
```

The response also carries `"message": "Download URL issued."` and
`"meta": { "expiresInSeconds": 900 }`.

The URL expires in **15 minutes**. It carries an `inline` content-disposition
header so browsers render the image directly rather than downloading it.

**Response `404`:** `UPLOAD_NOT_FOUND` — upload not found.

---

#### `GET /api/uploads`

List the authenticated user's confirmed uploads, newest first.

**Auth:** volunteer or admin.

**Response `200`** also carries `"message": "Retrieved your uploads."` and
`"meta": { "count": <n> }`:
```json
{
  "data": [
    {
      "id": "<uuid>",
      "user_id": "<uuid>",
      "original_name": "photo.jpg",
      "object_key": "uploads/<userId>/<uuid>.jpg",
      "content_type": "image/jpeg",
      "size_bytes": 204800,
      "status": "confirmed",
      "created_at": "2026-06-28T12:00:00.000Z",
      "updated_at": "2026-06-28T12:01:00.000Z"
    }
  ]
}
```

---

### User management (admin only)

All `/api/users` endpoints require an admin JWT.

#### `GET /api/users`

Returns all users. Password hashes are never included in any response.

**Response `200`:** `{ "data": [ { "id", "email", "name", "is_active", "created_at", "updated_at" }, ... ] }`
Also carries `"message": "Retrieved users."` and `"meta": { "count": <n> }`.

#### `POST /api/users`

Creates a new user.

**Body:**
```json
{ "email": "new@example.com", "password": "...", "name": "Jane", "role": "volunteer" }
```

`role` defaults to `"volunteer"` if omitted. Valid values: `"admin"`, `"volunteer"`.

**Response `201`:** the created user (no password hash).
Also carries `"message": "User created."` and `"meta": { "id": "<uuid>" }`.

**Response `409`:** `USER_EMAIL_TAKEN` — `{ "error": { "message": "Email already in use", ... } }`

#### `PATCH /api/users/:id`

Updates a user's email, name, password, or `is_active` flag. Only sent fields
are changed.

**Body:** any of `{ email?, name?, password?, is_active? }`.

**Response `200`:** the updated user.
Also carries `"message": "User updated."` and `"meta": { "id": "<uuid>" }`.

**Response `404`:** `USER_NOT_FOUND` — `{ "error": { "message": "User not found", ... } }`

#### `DELETE /api/users/:id`

Permanently deletes a user. The cascade on `user_roles` removes the role
assignment automatically.

**Response `204`:** no body.

**Response `404`:** `USER_NOT_FOUND` — `{ "error": { "message": "User not found", ... } }`

---

### Common error responses

Every error body has the same shape:

```json
{
  "error": {
    "message": "scum_photos must be an array of upload UUIDs",
    "code": "PMN_SCUM_RULE_VIOLATION",
    "details": { "field": "scum_photos", "expected": "array of upload UUIDs" },
    "requestId": "a3f9c1e2-5b7d-4e01-9f2a-1c8e44b6d0a7"
  }
}
```

`details` is present only on `4xx` responses and carries client-safe context
(field names, allowed values, what was received) — never DB internals. On `5xx` it
is always omitted and the message is deliberately generic; the full detail,
including the underlying `cause` chain, goes to the server log under the same
`requestId`.

| Status | When | Codes |
| --- | --- | --- |
| `400` | Missing/invalid field, malformed UUID, invalid query param, PMN scum-rule violation, unknown `loc_id`, malformed JSON body | `MISSING_FIELD`, `INVALID_FIELD`, `INVALID_ID`, `MALFORMED_JSON`, `PMN_SCUM_RULE_VIOLATION`, `PHOSPHATE_LOCATION_UNKNOWN`, `USER_ROLE_UNKNOWN` |
| `401` | No token, invalid/expired token, or wrong credentials | `UNAUTHORIZED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` |
| `403` | Authenticated but insufficient role, or an inactive account | `FORBIDDEN`, `ACCOUNT_INACTIVE` |
| `404` | Record/user/upload not found, or no such endpoint | `PMN_RECORD_NOT_FOUND`, `PMN_SCUM_PHOTO_NOT_FOUND`, `PHOSPHATE_RECORD_NOT_FOUND`, `USER_NOT_FOUND`, `UPLOAD_NOT_FOUND`, `ROUTE_NOT_FOUND` |
| `409` | Duplicate email on create/update | `USER_EMAIL_TAKEN` |
| `413` | Request body over the 1MB limit | `PAYLOAD_TOO_LARGE` |
| `415` | Unsupported request body encoding | `UNSUPPORTED_MEDIA_TYPE` |
| `429` | Rate limit exceeded | `RATE_LIMITED` |
| `500` | DB/query/S3 failure | `*_READ_FAILED`, `*_CREATE_FAILED`, `*_UPDATE_FAILED`, `*_DELETE_FAILED`, `AUTH_LOGIN_FAILED`, `INTERNAL_ERROR` |

The `4xx` message strings are unchanged from earlier versions, so a client that
string-matches them keeps working. New clients should use `error.code`.

### Error codes

Codes are **append-only**: once published, a code is never renamed and never
reused for a different condition. The full list lives in `src/http/error.codes.ts`.

| Code | Status | Meaning |
| --- | --- | --- |
| `ROUTE_NOT_FOUND` | 404 | No endpoint matches the method and path. |
| `MALFORMED_JSON` | 400 | The request body is not valid JSON, or was truncated. |
| `PAYLOAD_TOO_LARGE` | 413 | The request body exceeds the 1MB limit. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | The request body encoding is not supported. |
| `RATE_LIMITED` | 429 | Rate limit exceeded. |
| `INTERNAL_ERROR` | 500 | Unclassified server failure. |
| `INVALID_ID` | 400 | A path parameter or id field is not a UUID. |
| `MISSING_FIELD` | 400 | A required body field is absent. |
| `INVALID_FIELD` | 400 | A body or query field has a bad type or value. |
| `UNAUTHORIZED` | 401 | No credentials supplied, or the auth header is malformed. |
| `TOKEN_INVALID` | 401 | The JWT is malformed or its signature does not verify. |
| `TOKEN_EXPIRED` | 401 | The JWT is well-formed but past its expiry — re-login. |
| `FORBIDDEN` | 403 | Authenticated, but the role level is insufficient. |
| `INVALID_CREDENTIALS` | 401 | Unknown email or wrong password (indistinguishable by design). |
| `ACCOUNT_INACTIVE` | 403 | The account exists but `is_active` is false. |
| `AUTH_LOGIN_FAILED` | 500 | Login failed for a server-side reason. |
| `PMN_SCUM_RULE_VIOLATION` | 400 | A scum invariant was violated — see [Scum rules](#scum-rules). |
| `PMN_RECORD_NOT_FOUND` | 404 | No PMN record with that id. |
| `PMN_SCUM_PHOTO_NOT_FOUND` | 404 | The upload is not currently referenced as a scum photo (or does not exist). |
| `PMN_*_FAILED` | 500 | PMN read/create/update/delete/scum-lookup failure. |
| `PHOSPHATE_RECORD_NOT_FOUND` | 404 | No phosphate record with that id. |
| `PHOSPHATE_LOCATION_UNKNOWN` | 400 | No sampling location matches the `loc_id` supplied. |
| `PHOSPHATE_*_FAILED` | 500 | Phosphate read/create/update/delete failure. |
| `USER_NOT_FOUND` | 404 | No user with that id. |
| `USER_EMAIL_TAKEN` | 409 | That email is already registered. |
| `USER_ROLE_UNKNOWN` | 400 | The requested role is not configured on this server. |
| `USERS_*_FAILED` | 500 | User read/create/update/delete failure. |
| `UPLOAD_NOT_FOUND` | 404 | No upload with that id. |
| `UPLOADS_*_FAILED` | 500 | Presign/confirm/download-url/list failure. |

> Note: `429` responses also carry standard `RateLimit-*` headers
> (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).

---

### Quick test

```bash
# Health (no auth)
curl http://localhost:3001/health

# GET all records — no token needed
curl http://localhost:3001/api/pmn/combined-field-data

# Log in and capture the token
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<password>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# POST — create a record (volunteer or admin)
curl -X POST http://localhost:3001/api/pmn/combined-field-data \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sampling_site":"North Cove","sample_date":"2026-07-01T00:00:00.000Z"}'

# PATCH — update a field (admin only)
curl -X PATCH http://localhost:3001/api/pmn/combined-field-data/<id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"general_comments":"Updated comment"}'

# DELETE (admin only)
curl -X DELETE http://localhost:3001/api/pmn/combined-field-data/<id> \
  -H "Authorization: Bearer $TOKEN"

# GET all phosphate records with locations joined — no token needed
curl http://localhost:3001/api/phosphate-data

# POST a phosphate record (volunteer or admin) — send a flat loc_id
curl -X POST http://localhost:3001/api/phosphate-data \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"loc_id":"<location-uuid>","lab_case_file_number":1001,"measurement_date":"2026-07-01T00:00:00.000Z","measurement_time":"1970-01-01T09:30:00.000Z","analysis_date":"2026-07-02T00:00:00.000Z","analyte_id":"PO4","analyte_level":0.35,"unit":"mg/L","photos":[]}'

# Create a new user (admin only)
curl -X POST http://localhost:3001/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"vol@example.com","password":"...","role":"volunteer"}'

# Request presigned upload URLs for two images (volunteer or admin)
UPLOAD_RESP=$(curl -s -X POST http://localhost:3001/api/uploads/presigned-urls \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {"filename":"photo.jpg","contentType":"image/jpeg","sizeBytes":204800}
    ]
  }')
PRESIGNED_URL=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['presignedUrl'])")
UPLOAD_ID=$(echo "$UPLOAD_RESP"    | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['uploadId'])")

# PUT the file directly to S3 (no Authorization header — S3 uses the signed URL)
curl -X PUT "$PRESIGNED_URL" -H "Content-Type: image/jpeg" --data-binary @photo.jpg

# Confirm the upload
curl -X POST http://localhost:3001/api/uploads/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"uploadIds\":[\"$UPLOAD_ID\"]}"

# Get a presigned download URL
curl http://localhost:3001/api/uploads/$UPLOAD_ID/url \
  -H "Authorization: Bearer $TOKEN"

# List your uploads
curl http://localhost:3001/api/uploads \
  -H "Authorization: Bearer $TOKEN"

# Create a PMN record with a scum photo (has_scum is set to true automatically)
curl -X POST http://localhost:3001/api/pmn/combined-field-data \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sampling_site\":\"North Cove\",\"scum_photos\":[\"$UPLOAD_ID\"]}"

# Only records flagged with scum — no token needed
curl "http://localhost:3001/api/pmn/combined-field-data?hasScum=true"

# Public scum photo URL — no token needed
curl http://localhost:3001/api/pmn/scum-photos/$UPLOAD_ID/url
```

For a full end-to-end check of scum photos against `npm run dev` (needs a seeded
admin, S3 credentials, and `jq`):

```bash
ADMIN_EMAIL=... ADMIN_PASSWORD=... ./scripts/test-scum-photos.sh [path/to/photo.jpg]
```

---

## The data domain

This database backs a **cyanobacteria / harmful-algal-bloom (HAB) monitoring**
program plus general watershed water-quality sampling. "PMN" refers to a
phytoplankton-monitoring network: volunteers and staff record water-chemistry
readings and the presence of several cyanobacteria genera at lake/stream
sampling sites.

The **cyanobacteria genus columns** (`aphanizomenon`, `dolichospermum`,
`microcystis`, `planktothrix`, `raphidiopsis`, `woronichinia`) are free-text
strings describing observed presence/abundance — values are not a fixed enum, so
render them as text rather than assuming a controlled vocabulary.

---

## Database schema

Prisma's schema was originally introspected from an existing RDS database, then
**restructured for the local Docker environment** (see `prisma/schema.prisma`).
There are four Postgres schemas:

- `pmn` — `pmn_combined_field_data` (the served table).
- `camas` — `camas_city_data` (Camas city water readings).
- `watershed_field_data` — `locations` + `phosphate_data` (lab data).
- `users` — RBAC: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `upload`.

All primary keys are UUIDs (`@db.Uuid`), generated by the database via
`gen_random_uuid()`.

> **Two data endpoints are served today:** `pmn_combined_field_data` (via
> `/api/pmn/combined-field-data`) and `watershed_field_data.phosphate_data` (via
> `/api/phosphate-data`, with `locations` joined) — plus auth, user management,
> and image uploads. The `camas_city_data` table and the standalone `locations`
> table exist in the schema with generated Prisma types but have no endpoints of
> their own yet (`locations` is reachable only as a join on phosphate data).

### `pmn_combined_field_data` (the served table)

The canonical, merged PMN dataset — the union of staff field data and
(verified) volunteer input. This is what `GET /api/pmn/combined-field-data`
returns.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID (PK) | Always present; DB-generated via `gen_random_uuid()`. Do not send on POST. |
| `sample_date` | date | When the sample was taken. |
| `sample_time` | time | Time of day of the sample. |
| `sampling_site` | string | Site name. |
| `air_temperature` | decimal | |
| `weather` | string | Free text. |
| `wind_direction` | string | Free text (e.g. "NW"). |
| `wind_speed` | string | Free text (e.g. "5-10 mph"). |
| `barometeric_pressure` | decimal | (column name is misspelled in the DB; preserved as-is). |
| `water_temperature` | decimal | |
| `ph` | decimal | |
| `dissolved_oxygen` | decimal | |
| `conductivity` | decimal | |
| `total_dissolved_solids` | decimal | |
| `salt_ppt` | decimal | Salinity, parts per thousand. |
| `aphanizomenon` | string | Cyanobacteria genus — free-text presence/abundance. |
| `dolichospermum` | string | Cyanobacteria genus. |
| `microcystis` | string | Cyanobacteria genus. |
| `planktothrix` | string | Cyanobacteria genus. |
| `raphidiopsis` | string | Cyanobacteria genus. |
| `woronichinia` | string | Cyanobacteria genus. |
| `secchi` | decimal | Secchi-disk depth (water clarity). |
| `general_comments` | string | Free text. |
| `photos` | string[] | Array of photo URLs/paths. Defaults to `[]`. |
| `has_scum` | boolean | Scum (toxic algae) observed. Not nullable; defaults to `false`. Always `true` when `scum_photos` is non-empty. |
| `scum_photos` | string[] | Upload ids (`users.upload`) of scum photos. Defaults to `[]`. Max 10, confirmed images only, and none may also be in `photos`. **Publicly viewable** via `GET /api/pmn/scum-photos/:uploadId/url`. |

### `watershed_field_data.phosphate_data` (served, with `locations` joined)

Lab phosphate results returned by `GET /api/phosphate-data`. Every row is joined
to its sampling site via `loc_id`, and the joined `locations` row is nested under
a `locations` key in the response. Unlike the PMN table, the numeric columns here
are `Float` (JSON numbers, not strings), and only `notes` is nullable.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID (PK) | DB-generated. Do not send on POST. |
| `lab_case_file_number` | int | Lab case/file number. |
| `loc_id` | UUID (FK → `locations`) | Sampling site. On POST/PATCH, send as a **flat `loc_id`**. |
| `measurement_date` | date | When the sample was taken. |
| `measurement_time` | time | Time of day of the sample. |
| `analysis_date` | date | When the lab ran the analysis. |
| `analyte_id` | string(50) | Analyte code (e.g. `"PO4"`). |
| `analyte_level` | float | Measured concentration (JSON number). |
| `unit` | string(50) | Unit for `analyte_level` (e.g. `"mg/L"`). |
| `notes` | string \| null | Free text. The only nullable column. |
| `photos` | string[] | Array of photo URLs/paths. Defaults to `[]`. |
| `locations` | object | Nested joined site — `loc_id`, `loc_name`, `latitude` (float), `longitude` (float), `description` (string \| null). |

### Other tables (not yet exposed as data endpoints)

<details>
<summary><code>camas_city_data</code> — Camas city water readings (schema: camas)</summary>

UUID PK `id`. Columns: `location`, `date`, `time`, `depth`, `temp_c`,
`do_percent`, `do_mg_l`, `spc_us_cm`, `c_us_cm`, `tds_mg_l`, `ph`, `chl_a_rfu`,
`phyc_rfu`, `turbidity` (all decimal except location/date/time).
</details>

<details>
<summary><code>watershed_field_data.locations</code> — sampling sites (schema: watershed_field_data)</summary>

`loc_id` (UUID PK), `loc_name`, `latitude`, `longitude` (floats), `description`.
Has a one-to-many relation to `phosphate_data`. Not served on its own, but every
row is reachable as the nested `locations` object on `GET /api/phosphate-data`.
(`phosphate_data` itself **is** served — see the
[field table above](#watershed_field_dataphosphate_data-served-with-locations-joined).)
</details>

<details>
<summary><code>users</code> — RBAC + uploads (schema: users)</summary>

A classic user/role/permission model. All UUID PKs. Seeded with three roles
(`admin`, `volunteer`, `guest`) and five permissions (`data:read`, `data:write`,
`data:update`, `data:delete`, `users:manage`).

- `users` — `id`, `email` (unique), `password_hash`, `name`, `is_active`,
  `created_at`, `updated_at`.
- `roles` — `id`, `name` (unique), `description`.
- `permissions` — `id`, `name` (unique), `description`.
- `user_roles` — join table (`user_id`, `role_id` composite PK, `assigned_at`);
  FKs cascade.
- `role_permissions` — join table (`role_id`, `permission_id` composite PK);
  FKs cascade.
- `upload` — image upload metadata: `id`, `user_id` (FK → `users`, cascade
  delete), `original_name`, `object_key` (unique S3 key), `content_type`,
  `size_bytes`, `status` (`"pending"` | `"confirmed"`), `created_at`,
  `updated_at`. Object keys follow the pattern
  `uploads/<userId>/<uuid>.<ext>`.
</details>

### Field types & gotchas

These matter when binding the JSON to a UI:

- **`DECIMAL` → JSON string.** Prisma/Postgres serialize decimals as strings to
  preserve precision (`"7.40"`, `"120"`). Use `parseFloat`/`Number` before doing
  math or charting. Don't assume they're already numbers.
- **`DATE` → ISO string at midnight UTC.** e.g. `"2025-07-14T00:00:00.000Z"`.
  Use only the date portion; ignore the time half.
- **`TIME` → ISO string on the epoch date.** e.g. `"1970-01-01T09:30:00.000Z"`.
  Use only the time portion; ignore the `1970-01-01` date half.
- **Nearly everything is nullable.** Only `id` and `has_scum` are guaranteed
  present in the combined table. Guard every field.
- **Free-text fields are uncontrolled.** Weather, wind, comments, and the
  cyanobacteria genus columns have no fixed enum — render defensively.
- **One misspelled column:** `barometeric_pressure` (sic) — kept verbatim to
  match the DB.

---

## Architecture

API features follow a layered pattern, one directory per feature under `src/`:

```
*.queries.ts   Prisma data access
   → *.service.ts    business logic; wraps DB errors in a typed *ServiceError (original as `cause`)
   → *.controller.ts Express handler; responds via src/http/ helpers, forwards errors via next()
   → *.routes.ts     Express Router
```

`src/index.ts` wires it together: it mounts each feature router and registers
the central error middleware **last**. Every error class extends `ApiError`
(`src/http/api.error.ts`), which carries its own status, machine-readable `code`
and client-safe `publicMessage` — so the error middleware maps any thrown value to
a response without per-feature knowledge. It logs the full error, including a
redacted summary of the `cause` chain, keyed by `requestId`; DB internals never
reach clients. **PMN (`src/pmn/`) is the reference implementation** to copy when
adding a new feature.

#### The `src/http/` module

One place for everything about the HTTP envelope:

| File | Contents |
| --- | --- |
| `error.codes.ts` | The `ErrorCodes` const object and `ErrorCode` union. **Append-only.** |
| `api.error.ts` | `ApiError` + `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `TooManyRequestsError`, `InternalError`. |
| `respond.ts` | `ok`, `created`, `noContent`, `list` (derives `meta.count`), and `fail`. |
| `validate.ts` | `UUID_RE`/`isUuid` and the `require*` helpers, which throw `BadRequestError`. |
| `log.ts` | `logError`, `summarizeCause` and `redact` — server-side log shaping only. |

`ApiError` splits `message` (internal, logged, may name the failed operation) from
`publicMessage` (what the client sees). For `4xx` these are usually the same; for
`5xx` they must not be.

### Request lifecycle / middleware chain

```
requestId           first — assigns req.requestId, echoes X-Request-Id on every response
 → helmet           security headers, strips X-Powered-By
 → cors             allowlist from CORS_ALLOWED_ORIGINS; allows Authorization header
 → /health          (public, no auth, no rate limit; the one un-enveloped response)
 → express.json     1mb limit — over it yields 413 PAYLOAD_TOO_LARGE
 → rateLimiter      per-IP; applied to both /auth and /api before auth
 → /auth/login      public login endpoint (no JWT required)
 → jwtAuth          optional JWT extraction on /api — sets req.user if token valid;
                    passes through if no token (guest); 401 if token present but invalid
 → requireRole()    per-route guard — 401 unauthenticated, 403 insufficient role
 → feature routers  (/api/pmn, /api/phosphate-data, /api/users, /api/uploads)
 → notFoundHandler  unmatched routes → 404 ROUTE_NOT_FOUND in the JSON envelope
 → errorHandler     (last) maps ApiError → status/code/message; logs redacted cause
```

- **`requestId`** (`src/middleware/request.id.ts`) runs first so that cors, the
  rate limiter and the body parser all fail with a correlation id already
  attached. A client-supplied `X-Request-Id` is honored only if it matches
  `[A-Za-z0-9_-]{8,64}`, so it cannot be used to forge log entries.

- **`jwtAuth`** (`src/middleware/jwt.auth.ts`) validates a `Bearer` token if
  present. No token = guest access (passes through). Invalid/expired token = 401
  (never silently treated as guest). The body says only `"Unauthorized"` in every
  failure case; `error.code` distinguishes `TOKEN_EXPIRED` from `TOKEN_INVALID`,
  and the reason is logged. **Throws at startup if `JWT_SECRET` is
  unset** (fail-closed). Similarly, **`src/s3.ts` throws at startup if
  `AWS_REGION` or `S3_BUCKET_NAME` are unset** — same fail-closed pattern.
- **`requireRole(role)`** (`src/middleware/require.role.ts`) is a middleware
  factory that enforces a minimum role level: `"volunteer"` (allows volunteer and
  admin) or `"admin"` (admin only). Applied per-route, not globally.
- **`rateLimiter`** (`src/middleware/rate.limit.ts`) uses an in-memory store —
  fine for a single instance; a multi-instance deploy needs a shared store
  (e.g. Redis). Defaults: 100 requests / 15 min per IP.
- **`trust proxy`** is driven by `TRUST_PROXY` (default `0`) so the limiter keys
  on the real client IP without trusting spoofable `X-Forwarded-For`. Set it to
  the proxy hop count in deployment (e.g. `1` behind a single ALB).

### Source layout

```
src/
  index.ts                  app bootstrap, middleware chain, route mounting
  db.ts                     shared Prisma client (pg adapter, RDS SSL)
  types/
    express.d.ts            req.user + req.requestId type augmentation
  http/                     HTTP envelope: codes, error classes, responders, validation
    error.codes.ts          ErrorCodes const + ErrorCode union (append-only)
    api.error.ts            ApiError base + BadRequest/Unauthorized/Forbidden/NotFound/Conflict/TooManyRequests/Internal
    respond.ts              ok / created / noContent / list / fail — the only place a body is shaped
    validate.ts             UUID_RE, isUuid, require* helpers (throw BadRequestError)
    log.ts                  logError, summarizeCause, redact — server-side log shaping
    index.ts                barrel re-export
  middleware/
    request.id.ts           assigns req.requestId, sets X-Request-Id (mounted first)
    jwt.auth.ts             optional JWT extraction (fail-closed on missing JWT_SECRET)
    require.role.ts         requireRole() factory — enforces volunteer/admin levels
    rate.limit.ts           per-IP rate limiter
    not.found.handler.ts    unmatched routes → 404 ROUTE_NOT_FOUND
    error.handler.ts        central error middleware — ApiError → status/code/message
  auth/                     login feature
    auth.queries.ts         findUserByEmail (with roles join)
    auth.service.ts         loginUser — bcrypt verify, JWT sign, AuthServiceError
    auth.controller.ts      POST /login handler
    auth.routes.ts          authRouter → /login
  users/                    user management feature (admin only)
    users.queries.ts        CRUD + findRoleByName; omits password_hash at query level
    users.service.ts        listUsers, createNewUser, patchUser, removeUser
    users.controller.ts     GET / POST / PATCH / DELETE handlers
    users.routes.ts         usersRouter (all routes wrapped in requireRole("admin"))
  pmn/                      reference feature
    pmn.queries.ts          Prisma access — get (optional hasScum filter) / find by id / create / update / delete / scum-photo reference check
    pmn.service.ts          service functions, scum validation, PmnServiceError (500) + PmnValidationError (400)
    pmn.controller.ts       GET, POST, PATCH, DELETE handlers + public scum photo URL handler
    pmn.routes.ts           pmnRouter — GET public, POST volunteer+, PATCH/DELETE admin, GET /scum-photos/:uploadId/url public
  watershed/                phosphate-data feature (locations joined on GET)
    watershed.queries.ts    Prisma access — findLocationById / get (include locations) / create / update / delete
    watershed.service.ts    service functions + WatershedServiceError
    watershed.controller.ts GET, POST, PATCH, DELETE handlers (maps flat loc_id → relation)
    watershed.routes.ts     watershedRouter — GET public, POST volunteer+, PATCH/DELETE admin
  uploads/                  image upload feature
    uploads.queries.ts      Prisma access — create batch, confirm, find by ID, find confirmed by IDs, list by user
    uploads.service.ts      presigned URL generation + UploadsServiceError
    uploads.controller.ts   POST /presigned-urls, POST /confirm, GET /:id/url, GET /
    uploads.routes.ts       uploadsRouter — all routes require volunteer+
  s3.ts                     shared S3Client singleton (IAM role; throws at startup if AWS_REGION or S3_BUCKET_NAME unset)
prisma/
  schema.prisma             DB models (4 schemas: pmn, camas, watershed_field_data, users)
  seed.ts                   idempotent seed: roles, permissions, role-permissions, admin user
  migrations/                baseline (0_init) + incremental migrations (pmn photos, pmn UUIDs, uploads table, phosphate photos, pmn scum)
generated/prisma/           Prisma client output (gitignored, generated by `prisma generate`)
scripts/
  test-pmn-query.ts         standalone runner that hits the DB directly
  test-query.sh             wrapper that runs the above
  test-scum-photos.sh       end-to-end HTTP smoke test for PMN scum photos (needs running server, S3, jq)
prisma.config.ts            Prisma CLI config (schema, datasource URL, seed command)
nodemon.json                dev runner (ts-node on src)
tsconfig.json               TS config (target ES2020, CommonJS, ts-node: { files: true })
```

---

## Running locally

### Prerequisites

- Node.js (with npm) — `@types/node` targets Node 25.
- A PostgreSQL database. Either:
  - **Local Docker** — Docker + Docker Compose (see
    [Local development with Docker](#local-development-with-docker) below), or
  - Network access to a remote PostgreSQL/RDS database (a `DATABASE_URL`
    connection string).

### Setup

```bash
npm install

# Generate the Prisma client into generated/prisma (required before build/run)
npx prisma generate

# Create your env file from the template and fill it in
cp .env.example .env
```

Then edit `.env`. Required variables are `DATABASE_URL` and `JWT_SECRET`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes** | — | Postgres connection string. If unset, the pg adapter silently falls back to `localhost:5432` and queries fail with `ECONNREFUSED`. |
| `DATABASE_SSL` | no | _(SSL on)_ | Set to `false` to disable SSL/TLS on the DB connection. Required for a plain local Postgres (e.g. the Docker container); leave unset for AWS RDS, which requires SSL. |
| `JWT_SECRET` | **yes** | — | Secret used to sign and verify JWTs. Must be at least 32 random characters. **Server refuses to start if unset.** |
| `JWT_EXPIRES_IN` | no | `8h` | How long issued tokens remain valid. Uses [`ms`](https://github.com/vercel/ms) format (e.g. `8h`, `1d`, `30m`). |
| `ADMIN_SEED_EMAIL` | seed only | — | Email for the initial admin user. Only read by `npm run seed`. |
| `ADMIN_SEED_PASSWORD` | seed only | — | Password for the initial admin user. Only read by `npm run seed`. |
| `PORT` | no | `3000` | HTTP port. |
| `CORS_ALLOWED_ORIGINS` | no | _(empty = deny all cross-origin)_ | Comma-separated origin allowlist, e.g. `http://localhost:5173`. |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` (15 min) | Rate-limit window in milliseconds. |
| `RATE_LIMIT_MAX` | no | `100` | Max requests per window per IP. |
| `TRUST_PROXY` | no | `0` | Number of trusted proxy hops in front of the app. |
| `AWS_REGION` | **yes** | — | AWS region where the S3 bucket lives (e.g. `us-east-1`). **Server refuses to start if unset.** |
| `S3_BUCKET_NAME` | **yes** | — | Name of the S3 bucket for image uploads. **Server refuses to start if unset.** |

> **AWS credentials:** On EC2, credentials come from the IAM instance role
> automatically — do not set `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in
> `.env`. The AWS SDK picks up instance metadata credentials with no extra
> configuration. If running outside EC2, set those two variables in your
> environment (not in `.env` for production).

Generate a strong JWT secret with:

```bash
openssl rand -hex 32
```

### Local development with Docker

`docker-compose.yml` provides a disposable local Postgres. The app still runs on
the host (`npm run dev`); only the database is containerized.

```bash
docker compose up -d        # start Postgres in the background
```

Point `.env` at the container (no SSL — the local Postgres has no TLS):

```
DATABASE_URL=postgresql://lwc:lwc@localhost:5432/lwc_data
DATABASE_SSL=false
```

Apply the schema and seed the initial data:

```bash
npx prisma generate         # if not already done
npx prisma migrate deploy   # creates all tables from the baseline migration
npm run seed                # seeds roles, permissions, and initial admin user
```

Then run the app as usual (`npm run dev`). Managing the container:

```bash
docker compose ps           # check health
docker compose down         # stop (keeps data in the named volume)
docker compose down -v      # stop and wipe the database
```

The PMN table starts empty (endpoints return `{ "data": [] }` until you load
data) — but a successful empty response still confirms end-to-end connectivity.

### Run

```bash
npm run dev      # nodemon + ts-node, watches src/
npm run build    # tsc → dist/
npm start        # node dist/src/index.js (run build first)
npm run seed     # (re-)seed roles and admin user; idempotent, safe to re-run
```

`src/index.ts` loads env via `import "dotenv/config"` as its **first** line, so
both `npm run dev` and the compiled `npm start` pick up `.env` without a
`-r dotenv/config` preload.

### Smoke-testing the DB directly

To verify database connectivity without going through HTTP:

```bash
./scripts/test-query.sh          # runs scripts/test-pmn-query.ts via ts-node
```

This prints the row count and rows from `pmn_combined_field_data`. Per project
convention, prefer these standalone runner scripts over inline `console.log`s
when testing query code.

### Smoke-testing the response envelope

Against a running dev server, with a seeded admin:

```bash
ADMIN_EMAIL=... ADMIN_PASSWORD=... ./scripts/test-envelope.sh
npx ts-node scripts/test-redaction.ts   # log-redaction unit checks; no server needed
```

The rate-limit checks run last and exhaust the login bucket; since the limiter is
in-memory, restart the dev server between runs or pass `SKIP_RATE_LIMIT=1`. The
write round-trips create and delete their own rows, so the script leaves nothing
behind. Nothing in it touches S3.

`test-envelope.sh` asserts the status and `error.code` of every documented failure,
checks that `meta.count` matches the row count, that `error.requestId` matches the
`X-Request-Id` header, and sweeps every error body for connection strings, SQL,
`password_hash` and stack traces. `scripts/test-scum-photos.sh` doubles as a
back-compat regression test: it reads `.data.token`, `.data[0].uploadId` and
`.data.confirmed`, so it passing unchanged is the sharpest proof the envelope
stayed additive.

---

## Adding a new endpoint (for maintainers)

Copy the `src/pmn/` feature as a template:

1. `*.queries.ts` — Prisma calls only, return Prisma model types.
2. `*.service.ts` — wrap queries; catch and re-throw as a typed `*ServiceError`
   extending `InternalError` (from `src/http/api.error.ts`), passing the original
   as `cause` plus a per-call-site `code` and a client-safe `publicMessage`.
   Client-input problems get a class extending `BadRequestError` instead — see
   `PmnValidationError`. Add any new codes to `src/http/error.codes.ts`; that list
   is append-only. (Note: `tsconfig` targets ES2020, which predates the `Error`
   `{ cause }` constructor option, so `ApiError` assigns `cause` manually as a
   property.)
3. `*.controller.ts` — Express handler; respond with `ok` / `created` /
   `noContent` / `list` from `src/http/respond.ts`, giving each success a short
   message and any useful `meta`. Validate input with the `require*` helpers from
   `src/http/validate.ts` — they throw, so there is no `res.status(400)` in a
   controller. `next(err)` on failure; never `instanceof`-check a service error to
   pick a status, because the error already carries one. Never touch Prisma here.
4. `*.routes.ts` — an Express `Router`. Apply `requireRole("volunteer")` or
   `requireRole("admin")` per-route as needed. `GET` routes are public by
   default (no `requireRole`).
5. In `src/index.ts`, mount the router under `/api/<feature>` **before** the
   `notFoundHandler` and `errorHandler`.
6. Add the endpoint's cases to `scripts/test-envelope.sh`.

`src/middleware/error.handler.ts` needs **no** per-feature edit — it maps any
`ApiError` by its own status and code.

---

## Tech stack

- **Runtime/framework:** Node.js, Express 5, TypeScript (CommonJS, ES2020 target).
- **Data:** Prisma 7 with the `@prisma/adapter-pg` driver adapter over `pg`,
  against PostgreSQL (local Docker for development; AWS RDS-compatible for
  deployment).
- **Security:** `helmet`, `cors`, `express-rate-limit`, JWT authentication
  (`jsonwebtoken`) with `bcryptjs` password hashing and role-based access control.
- **Storage:** AWS S3 via `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
  Files upload directly from the client to S3 via short-lived presigned PUT URLs;
  they are never proxied through this server.
- **Dev:** `nodemon` + `ts-node`.

### Database SSL note

`src/db.ts` connects with `ssl: { rejectUnauthorized: false }` because AWS RDS
requires SSL/TLS. This currently does **not** verify the RDS server certificate
— see `.claude/notes/rds-ssl-hardening.md` for the deferred task to verify the
server cert. Read that note before touching DB SSL/connection config.

---

## Roadmap / known gaps

- **Limited data features exposed.** `pmn_combined_field_data` and
  `phosphate_data` have data endpoints. The `camas_city_data` table and the
  standalone `locations` table are modeled but not served on their own.
- **No role reassignment.** A user's role is set at creation via `POST /api/users`.
  There is no endpoint to change an existing user's role — requires direct DB
  access for now.
- **No pagination or sorting, and little filtering.** `GET /api/pmn/combined-field-data`
  returns the whole table on every call. The only filter is `hasScum`. Front ends
  should fetch once and filter or sort in the browser for now.
- **Partial upload confirms are still `200`.** `POST /api/uploads/confirm` reports
  a shortfall through `message` and `meta` (`requested` / `confirmed` / `skipped`)
  but does not fail the request when some ids are unknown or belong to another
  user. Changing the status would break existing clients, so it is deferred to a
  versioned change.
- **No `meta.pagination`.** `meta` currently carries only `count`, `id`, `filters`
  and expiry hints; pagination lands with the pagination work above.
- **Logging is `console.error` + JSON**, not a logging library. Structured and
  keyed by `requestId`, but there is no log level config or transport.
- **Single-instance rate limiting** (in-memory store).
- **RDS cert not verified** (see SSL note above).

---

## License

MIT — see [LICENSE](./LICENSE). Author: Terris Becker.
