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

- **Base URL:** `http://<host>:3001` (default port `3001`).
- **Auth:** role-based JWT. Log in at `POST /auth/login` to get a token, then
  send it as `Authorization: Bearer <token>` on protected requests.
- **Roles:** three levels — `guest` (unauthenticated), `volunteer`, `admin`.
  See the [permission table](#roles--permissions) for what each can do.
- **CORS:** the browser origin must be in the server's allowlist
  (`CORS_ALLOWED_ORIGINS`). Ask whoever runs the server to add yours.
- **PMN endpoints:** `GET`, `POST`, `PATCH`, and `DELETE` are all live under
  `/api/pmn/combined-field-data` (and `…/:id` for the latter two).
- **Image uploads:** volunteers and admins can upload up to 10 images at a time
  via presigned S3 URLs — see [Image uploads](#image-uploads-apiunloads).
- **Health probe:** `GET /health` is public (no auth, no rate limit).
- **Success shape:** `{ "data": <payload> }`. **Error shape:**
  `{ "error": { "message": "..." } }` (generic — never includes DB details).
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

**Response `401`:** `{ "error": { "message": "Invalid email or password" } }`

**Response `403`:** `{ "error": { "message": "Account is inactive" } }`

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

Returns **every row** of the `pmn_combined_field_data` table (no pagination,
filtering, or sorting yet — see [Roadmap](#roadmap--known-gaps)).

**Auth:** none required (guest access).

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
      "photos": []
    }
  ]
}
```

Every field except `id` may be `null`. Treat all measurement fields as nullable
in the UI. See the [field table](#pmn_combined_field_data-the-served-table) for
types and meaning.

---

### `POST /api/pmn/combined-field-data`

Creates a new record. The database assigns the UUID — do not send `id` in the
body.

**Auth:** volunteer or admin (`Authorization: Bearer <token>`).

**Body:** any subset of the fields in the table (all are optional — an empty
`{}` is valid; all nullable fields default to `null`, `photos` defaults to `[]`).

```json
{
  "sample_date": "2026-07-01T00:00:00.000Z",
  "sample_time": "1970-01-01T09:00:00.000Z",
  "sampling_site": "North Cove",
  "ph": 7.5,
  "dissolved_oxygen": 8.9
}
```

**Response `201`:** the created record as `{ "data": { ... } }`.

---

### `PATCH /api/pmn/combined-field-data/:id`

Partially updates an existing record. Only the fields present in the body are
changed; omitted fields are left as-is.

**Auth:** admin only (`Authorization: Bearer <token>`).

**Body:** any subset of mutable fields.

**Response `200`:** the updated record as `{ "data": { ... } }`.

**Response `404`:** `{ "error": { "message": "Record not found" } }` if `id`
does not match any row.

---

### `DELETE /api/pmn/combined-field-data/:id`

Deletes a record by UUID.

**Auth:** admin only (`Authorization: Bearer <token>`).

**Response `204`:** no body.

**Response `404`:** `{ "error": { "message": "Record not found" } }` if `id`
does not match any row.

---

### Image uploads (`/api/uploads`)

All upload endpoints require at minimum a volunteer JWT.

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

**Response `201`:**
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
{ "data": { "confirmed": 2 } }
```

`confirmed` is the count of records actually updated (pending → confirmed). IDs
that are already confirmed, don't exist, or belong to another user are silently
skipped.

---

#### `GET /api/uploads/:id/url`

Get a short-lived presigned S3 GET URL for a single upload. Only the upload's
owner can request its URL.

**Auth:** volunteer or admin.

**Response `200`:**
```json
{ "data": { "url": "https://s3.amazonaws.com/..." } }
```

The URL expires in **15 minutes**. It carries an `inline` content-disposition
header so browsers render the image directly rather than downloading it.

**Response `404`:** upload not found or belongs to another user.

---

#### `GET /api/uploads`

List the authenticated user's confirmed uploads, newest first.

**Auth:** volunteer or admin.

**Response `200`:**
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

#### `POST /api/users`

Creates a new user.

**Body:**
```json
{ "email": "new@example.com", "password": "...", "name": "Jane", "role": "volunteer" }
```

`role` defaults to `"volunteer"` if omitted. Valid values: `"admin"`, `"volunteer"`.

**Response `201`:** the created user (no password hash).

**Response `409`:** `{ "error": { "message": "Email already in use" } }`

#### `PATCH /api/users/:id`

Updates a user's email, name, password, or `is_active` flag. Only sent fields
are changed.

**Body:** any of `{ email?, name?, password?, is_active? }`.

**Response `200`:** the updated user.

**Response `404`:** `{ "error": { "message": "User not found" } }`

#### `DELETE /api/users/:id`

Permanently deletes a user. The cascade on `user_roles` removes the role
assignment automatically.

**Response `204`:** no body.

**Response `404`:** `{ "error": { "message": "User not found" } }`

---

### Common error responses

| Status | When | Body |
| --- | --- | --- |
| `400` | Missing required fields | `{ "error": { "message": "..." } }` |
| `401` | No token, invalid/expired token, or wrong credentials | `{ "error": { "message": "Unauthorized" } }` |
| `403` | Authenticated but insufficient role | `{ "error": { "message": "Forbidden" } }` |
| `404` | Record or user not found | `{ "error": { "message": "..." } }` |
| `409` | Duplicate email on create/update | `{ "error": { "message": "Email already in use" } }` |
| `429` | Rate limit exceeded | `{ "error": { "message": "Too many requests" } }` |
| `500` | DB/query failure | `{ "error": { "message": "Internal server error" } }` |

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

> **Only `pmn_combined_field_data` is exposed as a data endpoint today** (plus
> auth, user management, and image uploads). The `camas` and
> `watershed_field_data` tables exist in the schema and have generated Prisma
> types but no endpoints yet.

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
Has a one-to-many relation to `phosphate_data`. Useful for mapping if/when
exposed.
</details>

<details>
<summary><code>watershed_field_data.phosphate_data</code> — lab phosphate results (schema: watershed_field_data)</summary>

`id` (UUID PK), `lab_id`, `lab_case_file_number`, `loc_id` (UUID FK →
`locations`), `measurement_date`, `measurement_time`, `analysis_date`,
`analyte_id`, `analyte_level` (float), `unit`, `notes`.
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
- **Nearly everything is nullable.** Only `id` is guaranteed present in the
  combined table. Guard every field.
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
   → *.controller.ts Express handler; responds `{ data }`, forwards errors via next()
   → *.routes.ts     Express Router
```

`src/index.ts` wires it together: it mounts each feature router and registers
the central error middleware **last**. The error middleware logs the full error
server-side but returns only a generic JSON body, so DB internals never reach
clients. **PMN (`src/pmn/`) is the reference implementation** to copy when adding
a new feature.

### Request lifecycle / middleware chain

```
helmet              security headers, strips X-Powered-By
 → cors             allowlist from CORS_ALLOWED_ORIGINS; allows Authorization header
 → /health          (public, no auth, no rate limit)
 → rateLimiter      per-IP; applied to both /auth and /api before auth
 → /auth/login      public login endpoint (no JWT required)
 → jwtAuth          optional JWT extraction on /api — sets req.user if token valid;
                    passes through if no token (guest); 401 if token present but invalid
 → requireRole()    per-route guard — 401 unauthenticated, 403 insufficient role
 → feature routers  (/api/pmn, /api/users, /api/uploads)
 → errorHandler     (last) logs full error, returns generic body
```

- **`jwtAuth`** (`src/middleware/jwt.auth.ts`) validates a `Bearer` token if
  present. No token = guest access (passes through). Invalid/expired token = 401
  (never silently treated as guest). **Throws at startup if `JWT_SECRET` is
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
    express.d.ts            req.user type augmentation
  middleware/
    jwt.auth.ts             optional JWT extraction (fail-closed on missing JWT_SECRET)
    require.role.ts         requireRole() factory — enforces volunteer/admin levels
    rate.limit.ts           per-IP rate limiter
    error.handler.ts        central error middleware (generic responses)
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
    pmn.queries.ts          Prisma access — get / create / update / delete
    pmn.service.ts          service functions + PmnServiceError
    pmn.controller.ts       GET, POST, PATCH, DELETE handlers
    pmn.routes.ts           pmnRouter — GET public, POST volunteer+, PATCH/DELETE admin
  uploads/                  image upload feature
    uploads.queries.ts      Prisma access — create batch, confirm, find by ID, list by user
    uploads.service.ts      presigned URL generation + UploadsServiceError
    uploads.controller.ts   POST /presigned-urls, POST /confirm, GET /:id/url, GET /
    uploads.routes.ts       uploadsRouter — all routes require volunteer+
  s3.ts                     shared S3Client singleton (IAM role; throws at startup if AWS_REGION or S3_BUCKET_NAME unset)
prisma/
  schema.prisma             DB models (4 schemas: pmn, camas, watershed_field_data, users)
  seed.ts                   idempotent seed: roles, permissions, role-permissions, admin user
  migrations/0_init/        baseline migration SQL
generated/prisma/           Prisma client output (gitignored, generated by `prisma generate`)
scripts/
  test-pmn-query.ts         standalone runner that hits the DB directly
  test-query.sh             wrapper that runs the above
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

---

## Adding a new endpoint (for maintainers)

Copy the `src/pmn/` feature as a template:

1. `*.queries.ts` — Prisma calls only, return Prisma model types.
2. `*.service.ts` — wrap queries; catch and re-throw as a typed `*ServiceError`
   carrying the original as `cause`. (Note: `tsconfig` targets ES2020, which
   predates the `Error` `{ cause }` constructor option, so assign `cause`
   manually as a property — see `PmnServiceError`.)
3. `*.controller.ts` — Express handler; respond `{ data }`, `next(err)` on
   failure. Never touch Prisma here.
4. `*.routes.ts` — an Express `Router`. Apply `requireRole("volunteer")` or
   `requireRole("admin")` per-route as needed. `GET` routes are public by
   default (no `requireRole`).
5. In `src/index.ts`, mount the router under `/api/<feature>` **before** the
   `errorHandler`.
6. In `src/middleware/error.handler.ts`, add the new `*ServiceError` to the
   handler so unexpected DB errors return a feature-specific message.

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

- **Limited data features exposed.** Only `pmn_combined_field_data` has data
  endpoints. Camas, locations, and phosphate tables are modeled but not served.
- **No role reassignment.** A user's role is set at creation via `POST /api/users`.
  There is no endpoint to change an existing user's role — requires direct DB
  access for now.
- **No pagination, filtering, or sorting** — `GET /api/pmn/combined-field-data`
  returns the whole table every call. Front-ends should expect to fetch once and
  filter/sort client-side for now.
- **Single-instance rate limiting** (in-memory store).
- **RDS cert not verified** (see SSL note above).
- **Pending migration:** the `upload` table requires running
  `npx prisma migrate dev --name add_uploads_table` against a live database
  before the upload endpoints are functional.

---

## License

MIT — see [LICENSE](./LICENSE). Author: Terris Becker.
