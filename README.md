# LWC Data Server

The HTTP/JSON API behind the Lacamas Watershed Council's (LWC) field-monitoring
data. It publishes the observations LWC volunteers and staff collect on Lacamas
Lake and its tributaries, and accepts new records from authorized contributors.

Two datasets are served today:

- **PMN combined field data** — the phytoplankton monitoring network dataset:
  water-quality readings (temperature, pH, dissolved oxygen, conductivity, Secchi
  depth and more) alongside observed presence of six **cyanobacteria genera**, plus
  a scum (harmful-algal-bloom) flag and photographs.
- **Phosphate data** — laboratory phosphate results joined to the sampling
  location where each sample was taken (name, latitude, longitude).

**Production API:** `https://api.lacamaswatershed.org`

Reading data is **open to the public — no account, no key, no registration.** All API requests are rate limited to block bots from causing congestion on the server.
An account is only needed to *submit* data.

### Which part of this document do I want?

| You are… | Read |
| --- | --- |
| A scientist, agency staffer, or analyst who wants the data | [Part 1 — Using the data](#part-1--using-the-data) |
| A developer who wants to run or improve the server | [Part 2 — Contributing](#part-2--contributing) |
| Anyone who needs exact request/response shapes | [Part 3 — API reference](#part-3--api-reference) |

---

# Part 1 — Using the data

This part assumes no programming background beyond a willingness to paste a
command into a terminal or a URL into a spreadsheet. Everything here uses the
production server at `https://api.lacamaswatershed.org`.

## The two data URLs

| Dataset | URL |
| --- | --- |
| PMN combined field data | <https://api.lacamaswatershed.org/api/pmn/combined-field-data> |
| Phosphate lab results | <https://api.lacamaswatershed.org/api/phosphate-data> |

Open either one in a web browser and you will see the whole dataset as JSON.
Firefox and Chrome both render JSON in a collapsible viewer, which is often enough
for a quick look.

Each response is a small wrapper around the rows:

```json
{
  "data": [ { …record… }, { …record… } ],
  "message": "Retrieved PMN combined field data.",
  "meta": { "count": 2 }
}
```

The rows you want are under **`data`**. `meta.count` tells you how many rows of data are available.
Every request returns the **entire table**. For now, there is no paging, so you always get the full dataset upon request.

## Getting the data into a tool you actually use

### Excel (Power Query)

1. **Data → Get Data → From Other Sources → From Web**
2. Paste `https://api.lacamaswatershed.org/api/pmn/combined-field-data`
3. Excel opens the Power Query editor showing a record with `data`, `message`,
   `meta`. Click **`data`** (it shows as a List) → **To Table** → expand the
   column with the ⇔ icon to spread the fields into columns.
4. **Close & Load.** Refreshing the sheet later re-pulls the current data.

For the phosphate dataset, expand the nested **`locations`** column the same way to
get `loc_name`, `latitude`, and `longitude` as their own columns.


### R

```r
library(jsonlite)

pmn <- fromJSON("https://api.lacamaswatershed.org/api/pmn/combined-field-data")$data
phosphate <- fromJSON("https://api.lacamaswatershed.org/api/phosphate-data")$data

# Measurements arrive as text to preserve precision — convert what you'll analyze:
pmn$ph <- as.numeric(pmn$ph)
pmn$water_temperature <- as.numeric(pmn$water_temperature)
pmn$sample_date <- as.Date(pmn$sample_date)

# jsonlite flattens the phosphate join into locations.loc_name, locations.latitude, …
phosphate <- jsonlite::flatten(phosphate)
```

### Python

```python
import pandas as pd
import requests

BASE = "https://api.lacamaswatershed.org"

pmn = pd.DataFrame(requests.get(f"{BASE}/api/pmn/combined-field-data").json()["data"])
pmn["ph"] = pd.to_numeric(pmn["ph"])
pmn["sample_date"] = pd.to_datetime(pmn["sample_date"]).dt.date

phos = pd.json_normalize(requests.get(f"{BASE}/api/phosphate-data").json()["data"])
# → columns include locations.loc_name, locations.latitude, locations.longitude
```

### Command line

```bash
# Save the raw response
curl -o pmn.json https://api.lacamaswatershed.org/api/pmn/combined-field-data

# Just the records, pretty-printed (requires jq)
curl -s https://api.lacamaswatershed.org/api/pmn/combined-field-data | jq '.data'

# Records to CSV (requires jq)
curl -s https://api.lacamaswatershed.org/api/pmn/combined-field-data \
  | jq -r '.data | (.[0] | keys_unsorted) as $k | $k, map([.[$k[]]])[] | @csv' > pmn.csv
```

## Reading the values correctly

Some useful tips if this is your first time accessing the data:

1. **Most numbers arrive as quoted text.** PMN measurements are stored as exact
   decimals and serialize as strings — `"ph": "7.40"`, not `7.4`. This preserves
   significant figures, but it means you must
   convert before averaging or plotting. Phosphate values are the exception: they
   are floating-point and arrive as plain numbers.
2. **Dates and times are separate fields, both stamped as full timestamps.**
   `sample_date` looks like `"2026-05-01T00:00:00.000Z"` but use the date half only.
   `sample_time` looks like `"1970-01-01T08:30:00.000Z"` and you should use the time half only
   and ignore the 1970 date, which is a placeholder, not a real date. The time is
   the local clock time recorded in the field (Pacific Daylight Time).
3. **Almost every PMN field can be empty (`null`).** Volunteers record what
   conditions and equipment allow. Only `id` and `has_scum` are always present. Null values indicate that data was not collected.
4. **The cyanobacteria genus fields are chosen from one of three options.**
   `aphanizomenon`, `dolichospermum`, `microcystis`, `planktothrix`,
   `raphidiopsis`, and `woronichinia` can be either Yes, No, or Elevated. Volunteers count cyanobacteria species on a microscope slide and categorize their abundance accordingly. No does not mean that there was 0 cyanobacteria of that genus; just that there was not enough to be worrisome.
5. **`barometeric_pressure` is misspelled** in the field name. The spelling is
   preserved for now so existing downloads keep working. It is barometric
   pressure, and will be fixed in an upcoming update.

See the [data dictionary](#data-dictionary) in Part 3 for every field, its type,
and its units.

## Scum observations and photographs

`has_scum` marks a record where surface scum — the visible sign of a possible
harmful algal bloom — was observed. When a photograph was taken, `scum_photos`
holds one or more identifiers.

Scum photos are **public**: no account is needed to view them. Exchange an
identifier for a viewable image link:

```bash
curl https://api.lacamaswatershed.org/api/pmn/scum-photos/<uploadId>/url
```

```json
{
  "data": {
    "url": "https://s3.amazonaws.com/…",
    "contentType": "image/jpeg",
    "originalName": "scum.jpg"
  },
  "meta": { "expiresInSeconds": 900 }
}
```

Open the `url` in a browser to see the photo. **It expires after 15 minutes** —
request a fresh one rather than saving or emailing the link. All other photos
(`photos` on either dataset) require an account.

## Filtering and volume

Server-side filtering is deliberately minimal. The only filter is on the PMN
dataset:

```
https://api.lacamaswatershed.org/api/pmn/combined-field-data?hasScum=true
https://api.lacamaswatershed.org/api/pmn/combined-field-data?hasScum=false
```

Anything else — by site, by date range, by genus — is done in your own tool after
downloading. Because every call returns the full table, **download once and work
from the saved copy** rather than re-requesting in a loop. As a courtesy the
server allows roughly 100 requests per 15 minutes from one address; past that it
replies `429` and you should wait for the window named in the `RateLimit-Reset`
header. Normal analysis work never approaches this.

## Citing and caveats

These are **volunteer- and staff-collected field observations**, published as
recorded. They are not laboratory-certified except where the phosphate dataset
carries a `lab_case_file_number`. Cyanobacteria genus entries are visual field
identifications, not cell counts. Please contact LWC before using the data in a
regulatory or public-health determination, and note the date you downloaded it —
records are corrected and added over time, and the API always serves the current
state with no version history.

## Getting an account to submit data

Submitting, editing, or deleting records requires an account, which an LWC
administrator creates for you — there is no self-service signup. Two levels exist:

- **Volunteer** — may add new PMN and phosphate records and upload photos.
- **Administrator** — may additionally edit and delete records and manage accounts.

Once you have credentials, exchange them for a token (valid 8 hours) and send it on
each write. See [Authentication](#authentication) and the
[endpoint reference](#endpoints) in Part 3 for the exact calls.

## When something goes wrong

Errors come back in a consistent shape:

```json
{
  "error": {
    "message": "hasScum must be true or false",
    "code": "INVALID_FIELD",
    "details": { "field": "hasScum", "expected": "true | false" },
    "requestId": "a3f9c1e2-5b7d-4e01-9f2a-1c8e44b6d0a7"
  }
}
```

`message` says what to fix. If you report a problem to LWC, **include the
`requestId`** because it identifies the exact request in the server logs. The
[error-code table](#error-codes) lists every code and what it means.

---

# Part 2 — Contributing

`api.lacamaswatershed.org` runs a deployment of this repository. Contributions go
through the usual fork/branch -> pull request against `main`. Please contact terris@lacamaswatershed.org if you would like to contribute to the repository.

## Tech stack

- **Runtime:** Node.js 22 LTS (what production runs; no `engines` field pins it),
  TypeScript (CommonJS, ES2020 target).
- **Framework:** Express 5.
- **Data:** Prisma 7 with the `@prisma/adapter-pg` driver adapter over `pg`,
  against PostgreSQL (local Docker in development, AWS RDS in production).
- **Security:** `helmet`, `cors`, `express-rate-limit`, JWT auth (`jsonwebtoken`)
  with `bcryptjs` hashing and role-based access control.
- **Storage:** AWS S3 via `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
  Files move directly between client and S3 through short-lived presigned URLs and
  are never proxied through this server.
- **Dev:** `nodemon` + `ts-node`.

## Prerequisites

- Node.js with npm.
- Docker + Docker Compose for the local Postgres, **or** network access to a remote
  PostgreSQL/RDS instance.
- An S3 bucket and AWS credentials. `AWS_REGION` and `S3_BUCKET_NAME` are read at
  startup and the server **refuses to start without them**, even if you never touch
  an upload endpoint. See [S3 access](#s3-access) below.

## Running locally

```bash
npm install
npx prisma generate            # emits the client into generated/prisma — required before build/run
cp .env.example .env           # then fill in the blanks (see Environment below)

docker compose up -d           # local Postgres; the app itself runs on the host
npx prisma migrate deploy      # create all tables from the migrations
npm run seed                   # roles, permissions, and the initial admin user (idempotent)
npm run dev                    # nodemon + ts-node, watching src/
```

`.env.example` already points at the Docker container; the two lines that matter are:

```
DATABASE_URL=postgresql://lwc:lwc@localhost:5432/lwc_data
DATABASE_SSL=false
```

The local container has no TLS, so `DATABASE_SSL=false` is required. Leave it unset
for AWS RDS, which requires SSL.

Generate a JWT secret with `openssl rand -hex 32`.

The data tables start empty, so endpoints return `{ "data": [] }` until you load
rows — a successful empty response still confirms end-to-end connectivity.

Managing the database container:

```bash
docker compose ps       # check health
docker compose down     # stop, keeping data in the named volume
docker compose down -v  # stop and wipe the database
```

### Scripts

```bash
npm run dev             # dev server with reload
npm run build           # tsc → dist/
npm start               # node dist/src/index.js (run build first)
npm run seed            # roles, permissions, admin user — idempotent
npm run seed:locations  # sampling locations for watershed_field_data
```

## Environment

`src/index.ts` loads `.env` via `import "dotenv/config"` on its first line, so both
`npm run dev` and the compiled `npm start` pick it up with no preload flag.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes** | — | Postgres connection string. If unset, the pg adapter silently falls back to `localhost:5432` and queries fail with `ECONNREFUSED`. |
| `DATABASE_SSL` | no | _(SSL on)_ | Set to `false` for a plain local Postgres. Leave unset for AWS RDS. |
| `JWT_SECRET` | **yes** | — | Signs and verifies JWTs; use at least 32 random characters. **Server refuses to start if unset.** |
| `JWT_EXPIRES_IN` | no | `8h` | Token lifetime, in [`ms`](https://github.com/vercel/ms) format (`8h`, `1d`, `30m`). |
| `AWS_REGION` | **yes** | — | Region of the S3 bucket. **Server refuses to start if unset.** |
| `S3_BUCKET_NAME` | **yes** | — | Bucket for uploads. **Server refuses to start if unset.** |
| `PORT` | no | `3000` | HTTP port. `.env.example` sets `3001`, which is what the examples below use. |
| `CORS_ALLOWED_ORIGINS` | no | _(empty = deny all cross-origin)_ | Comma-separated origin allowlist, e.g. `http://localhost:5173`. |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` (15 min) | General rate-limit window. |
| `RATE_LIMIT_MAX` | no | `100` | Max requests per window per IP on `/api`. Does **not** affect the login limit. |
| `TRUST_PROXY` | no | `0` | Number of trusted proxy hops, so the limiter keys on the real client IP. Set to `1` behind a single ALB. |
| `ADMIN_SEED_EMAIL` | seed only | — | Initial admin's email. Read only by `npm run seed`. |
| `ADMIN_SEED_PASSWORD` | seed only | — | Initial admin's password. Read only by `npm run seed`. |

> **AWS credentials:** on EC2 they come from the IAM instance role automatically —
> do not put `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in `.env`. Outside EC2,
> set them in your shell environment.

## S3 access

Uploads never pass through this server: it only signs short-lived URLs, and the
client PUTs and GETs objects directly against S3. That means a working local setup
needs a bucket you can sign for.

Two ways to get one:

- **Your own bucket (recommended for contributors).** Follow
  [`docs/s3-setup.md`](./docs/s3-setup.md) — it covers bucket creation, the CORS
  configuration the browser upload requires, and a least-privilege IAM policy
  scoped to the `uploads/*` prefix. A personal dev bucket keeps you out of
  production data entirely and is the fastest path.
- **Access to the LWC bucket.** Ask an LWC administrator for an IAM user with the
  policy from `docs/s3-setup.md`. Expect to explain what you are building; access
  to production uploads is granted sparingly. Configure the credentials in your
  shell (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` or an `aws configure`
  profile), never in `.env` or a commit.

Set `AWS_REGION` and `S3_BUCKET_NAME` to match whichever bucket you use. A region
mismatch surfaces as signature or `301 PermanentRedirect` errors on the PUT.

## Code layout

Each API feature is a directory under `src/`, layered the same way:

```
*.queries.ts     Prisma data access
*.service.ts     business logic; wraps DB errors in a typed *ServiceError
*.controller.ts  Express handler; responds via src/http/, forwards errors via next()
*.routes.ts      Express Router, with requireRole() applied per route
```

`src/pmn/` is the reference implementation to copy when adding a feature.
`src/index.ts` mounts each router and registers the error handler **last**.
`src/http/` owns the response envelope, the error classes, validation helpers, and
log redaction — no feature module shapes a response body or a status code itself.

Conventions worth knowing before you open a PR:

- **Error codes are append-only** (`src/http/error.codes.ts`): never rename a code,
  never reuse a retired one. Clients branch on them.
- **Every error class extends `ApiError`**, so it carries its own status and code
  and the central handler needs no per-feature knowledge.
- **`message` is internal, `publicMessage` is what the client sees.** For 5xx they
  must differ — internal messages may name the failed operation.
- **Never let a message confirm a record the caller isn't entitled to know about.**
  Two responses are deliberately vague and must stay that way: the login `401`
  (identical for unknown email and wrong password) and the public scum-photo `404`
  (identical for an unknown upload and a non-scum one).
- **Validation helpers throw** `BadRequestError`; controllers contain no
  `res.status(400)`.
- Run `npx prisma generate` after any schema change; the client is gitignored.

**There is no automated test suite.** `"test": "test"` in `package.json` is a
placeholder and `scripts/` holds only `deploy.sh`. Verify changes manually with the
curl examples in [Part 3](#part-3--api-reference) and say in the PR what you ran.

## Deployment

[`docs/production.md`](./docs/production.md) documents the production setup:
EC2, PM2, nginx, Let's Encrypt TLS, and running migrations against RDS.

---

# Part 3 — API reference

## Conventions

- **Base URL:** `https://api.lacamaswatershed.org` in production;
  `http://localhost:3001` for a local server, matching `.env.example` (the code
  default when `PORT` is unset is `3000`). The examples below use the local URL —
  substitute the production host as needed.
- **Success envelope:** `{ "data": <payload>, "message"?: "…", "meta"?: { … } }`.
  `message` and `meta` are omitted when there is nothing to say. `meta` carries
  `count` on list responses, `id` on writes, `filters` when a filter was applied,
  and `expiresInSeconds` on presigned-URL responses.
- **Error envelope:** `{ "error": { "message", "code", "details"?, "requestId" } }`.
  **Branch on `error.code`**, never on the message text. Error bodies never contain
  DB details, SQL, or stack traces.
- **`GET /health` is the one un-enveloped response** — it returns
  `{ "status", "uptime", "timestamp" }` directly so load-balancer probes can parse
  it without unwrapping. It is also exempt from auth and rate limiting.
- **CORS:** a browser origin must appear in the server's `CORS_ALLOWED_ORIGINS`
  allowlist, or the request is rejected before it reaches a route. Only
  `Content-Type` and `Authorization` are allowed as request headers. This does not
  affect curl, R, Python, or Excel, which are not browsers.
- **Rate limits:** two independent limiters, both per-IP and both returning `429`
  `RATE_LIMITED` with standard `RateLimit-Limit` / `RateLimit-Remaining` /
  `RateLimit-Reset` headers.
  - `/api` — 100 requests / 15 min, tunable via `RATE_LIMIT_MAX` and
    `RATE_LIMIT_WINDOW_MS`.
  - `/auth` — **10 requests / 15 min**, hardcoded and not configurable. Budget login
    retries accordingly.
- **Request bodies** are JSON, capped at **1 MB**; over that yields `413`
  `PAYLOAD_TOO_LARGE`. Invalid JSON yields `400` `MALFORMED_JSON`.
- **Request ids:** every response carries an `X-Request-Id` header and every error
  body repeats it as `error.requestId`. Quote it when reporting a `500` — it is the
  key to the matching server log entry. A client-supplied `X-Request-Id` is honored
  only if it matches `[A-Za-z0-9_-]{8,64}`.
- **Numbers may arrive as strings.** PostgreSQL `DECIMAL` columns (all PMN
  measurements) serialize as JSON strings like `"7.40"` to preserve precision; parse
  them before doing math. Phosphate columns are `double precision` and do arrive as
  JSON numbers.
- **Dates and times are full ISO-8601 timestamps.** A `DATE` column becomes
  `"2026-05-01T00:00:00.000Z"` — use only the date half. A `TIME` column becomes
  `"1970-01-01T08:30:00.000Z"` — use only the time half and ignore the epoch date.
- **Nearly every PMN field is nullable.** Only `id` and `has_scum` are guaranteed
  present. Free-text fields (weather, wind, comments, the cyanobacteria genus
  columns) have no fixed enum — render them defensively as text.

## Authentication

`POST /auth/login` exchanges an email and password for a JWT. Send it on subsequent
requests as `Authorization: Bearer <token>`.

A missing header means guest access — reads still work. A malformed or expired
token is a `401`; it is never silently downgraded to guest. The body is a flat
`"Unauthorized"` in every auth failure, and only `error.code` distinguishes
`TOKEN_EXPIRED` from `TOKEN_INVALID`. Tokens last `JWT_EXPIRES_IN` (default 8
hours); there is no refresh endpoint, so log in again.

## Roles & permissions

| Role | GET data | POST data | PATCH data | DELETE data | Uploads | Manage users |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| **guest** (no token) | ✓ | — | — | — | — | — |
| **volunteer** | ✓ | ✓ | — | — | ✓ | — |
| **admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

"Guest" is the *absence* of a token rather than a role the API assigns: reads are
open to anyone, and no credentials are needed for them. Guests cannot read uploads
in general, with one deliberate exception — PMN scum photos, below. Only `admin`
and `volunteer` can be assigned to a user account.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | public | Liveness probe. Un-enveloped, never rate-limited. |
| `POST` | `/auth/login` | public | Exchange email + password for a JWT. |
| `GET` | `/api/pmn/combined-field-data` | guest | All PMN records; optional `?hasScum=true` \| `false`. |
| `POST` | `/api/pmn/combined-field-data` | volunteer | Create a PMN record. |
| `PATCH` | `/api/pmn/combined-field-data/:id` | admin | Partially update a PMN record. |
| `DELETE` | `/api/pmn/combined-field-data/:id` | admin | Delete a PMN record. |
| `GET` | `/api/pmn/scum-photos/:uploadId/url` | **public** | Presigned GET URL for a scum photo. |
| `GET` | `/api/phosphate-data` | guest | All phosphate records with `locations` joined. |
| `POST` | `/api/phosphate-data` | volunteer | Create a phosphate record. |
| `PATCH` | `/api/phosphate-data/:id` | admin | Partially update a phosphate record. |
| `DELETE` | `/api/phosphate-data/:id` | admin | Delete a phosphate record. |
| `POST` | `/api/uploads/presigned-urls` | volunteer | Request up to 10 presigned S3 PUT URLs. |
| `POST` | `/api/uploads/confirm` | volunteer | Mark uploads confirmed after the PUTs succeed. |
| `GET` | `/api/uploads/:id/url` | volunteer | Presigned GET URL for any one upload. |
| `GET` | `/api/uploads` | volunteer | List your own confirmed uploads, newest first. |
| `GET` | `/api/users` | admin | List all users (never includes password hashes). |
| `POST` | `/api/users` | admin | Create a user. |
| `PATCH` | `/api/users/:id` | admin | Update email, name, password, or `is_active`. |
| `DELETE` | `/api/users/:id` | admin | Delete a user; the `user_roles` cascade cleans up. |

`volunteer` means volunteer **or** admin. Writes respond `201` (POST) or `200`
(PATCH) with the affected record in `data`; deletes respond `204` with no body.
Every `:id` path parameter must be a UUID or the request fails `400` `INVALID_ID`.

## Examples

### Log in

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"..."}'
```

```json
{
  "data": {
    "token": "<jwt>",
    "user": { "id": "<uuid>", "email": "admin@example.com", "roles": ["admin"] }
  },
  "message": "Signed in."
}
```

The `401` `INVALID_CREDENTIALS` response is byte-identical for an unknown email and
a wrong password, so the endpoint cannot be used to discover registered addresses.
A disabled account gets `403` `ACCOUNT_INACTIVE`.

Capture the token for the calls below:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"..."}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
```

### Read PMN records

```bash
curl http://localhost:3001/api/pmn/combined-field-data
curl "http://localhost:3001/api/pmn/combined-field-data?hasScum=true"
```

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
  ],
  "message": "Retrieved PMN combined field data.",
  "meta": { "count": 1 }
}
```

`meta.filters.hasScum` is added when the filter is applied. Any `hasScum` value
other than `true` or `false` is `400` `INVALID_FIELD`.

### Create and update a PMN record

Every field is optional — even `{}` is valid. The database assigns `id`, so never
send one.

```bash
curl -X POST http://localhost:3001/api/pmn/combined-field-data \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sampling_site":"North Cove","sample_date":"2026-07-01T00:00:00.000Z","ph":7.5}'

curl -X PATCH http://localhost:3001/api/pmn/combined-field-data/<id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"general_comments":"Updated comment"}'
```

Both return the full record in `data`, with `meta.id`. Omitted fields default to
`null`, `photos` and `scum_photos` to `[]`, and `has_scum` to `false`. PATCH changes
only the fields present in the body. A missing `:id` is `404`
`PMN_RECORD_NOT_FOUND`.

#### Scum rules

`has_scum` and `scum_photos` are validated on POST and PATCH, and on PATCH the check
runs against the record **after** the merge. Violations are `400`
`PMN_SCUM_RULE_VIOLATION`, with `details.field` naming the offender.

- `has_scum` must be a boolean; `scum_photos` an array of upload UUIDs, at most 10.
- A non-empty `scum_photos` forces `has_scum` to `true`. Omit `has_scum` and the
  server sets it; send `has_scum: false` alongside photos and the request is
  rejected. To clear scum, send `{ "has_scum": false, "scum_photos": [] }` together.
- `has_scum: true` with no photos is fine — scum seen, no photo taken.
- An upload id cannot appear in both `photos` and `scum_photos`.
- Every scum photo must be a **confirmed `image/*` upload** (PDFs are rejected here
  even though uploads accept them). Adding an id to `scum_photos` makes that image
  **publicly viewable**.

### Read a scum photo without logging in

```bash
curl http://localhost:3001/api/pmn/scum-photos/<uploadId>/url
```

```json
{
  "data": {
    "url": "https://s3.amazonaws.com/...",
    "contentType": "image/jpeg",
    "originalName": "scum.jpg"
  },
  "message": "Scum photo URL issued.",
  "meta": { "expiresInSeconds": 900 }
}
```

The URL is issued only while at least one PMN record still lists that id in its
`scum_photos`, and expires in 15 minutes. Once no record references it, the endpoint
returns `404` `PMN_SCUM_PHOTO_NOT_FOUND` with **no `details`** — an unknown upload
and a non-scum upload are deliberately indistinguishable. For any other file, use
the authenticated `GET /api/uploads/:id/url`.

### Read and create phosphate records

```bash
curl http://localhost:3001/api/phosphate-data
```

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
  ],
  "message": "Retrieved phosphate data.",
  "meta": { "count": 1 }
}
```

On write, send a **flat `loc_id`** — the UUID of an existing `locations` row — and
the server maps it to the underlying relation. Everything except `notes` and
`photos` is required on POST.

```bash
curl -X POST http://localhost:3001/api/phosphate-data \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"loc_id":"<location-uuid>","lab_case_file_number":1001,
       "measurement_date":"2026-07-01T00:00:00.000Z",
       "measurement_time":"1970-01-01T09:30:00.000Z",
       "analysis_date":"2026-07-02T00:00:00.000Z",
       "analyte_id":"PO4","analyte_level":0.35,"unit":"mg/L","photos":[]}'
```

A missing `loc_id` is `400` `MISSING_FIELD`, a non-UUID one `400` `INVALID_ID`, and
one that matches no row `400` `PHOSPHATE_LOCATION_UNKNOWN`. PATCH accepts the same
flat `loc_id` to move a record to a different site.

### Upload a file

Three steps: ask for a presigned URL, PUT the bytes straight to S3, then confirm.
The file never passes through this server.

```bash
# 1. Request URLs — up to 10 files per call
UPLOAD_RESP=$(curl -s -X POST http://localhost:3001/api/uploads/presigned-urls \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"files":[{"filename":"photo.jpg","contentType":"image/jpeg","sizeBytes":204800}]}')
```

```json
{
  "data": [
    {
      "uploadId": "<uuid>",
      "presignedUrl": "https://s3.amazonaws.com/...",
      "objectKey": "uploads/<userId>/<uuid>.jpg"
    }
  ],
  "message": "Upload URLs issued.",
  "meta": { "count": 1, "expiresInSeconds": 300 }
}
```

```bash
# 2. PUT the raw bytes — no Authorization header, no multipart encoding.
#    Content-Type must match what you declared.
curl -X PUT "<presignedUrl>" -H "Content-Type: image/jpeg" --data-binary @photo.jpg

# 3. Confirm
curl -X POST http://localhost:3001/api/uploads/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uploadIds":["<uploadId>"]}'
```

```json
{
  "data": { "confirmed": 1 },
  "message": "Confirmed 1 of 2 uploads.",
  "meta": { "requested": 2, "confirmed": 1, "skipped": 1 }
}
```

Constraints on step 1, each a `400` `INVALID_FIELD` (or `INVALID_ID` for a
malformed upload id) with a `details` object carrying the allowed values:

- `files` must be a non-empty array of at most **10** entries.
- Allowed `contentType`: `image/jpeg`, `image/png`, `image/webp`, `image/gif`,
  `application/pdf`. Only the `image/*` types are usable as PMN scum photos.
- `sizeBytes` must be between 1 and **10,485,760** (10 MB). This is a *declared*
  size the server validates; S3 does not enforce it, so a client can PUT a larger
  object than it declared.
- The `presignedUrl` expires in **5 minutes**.

A confirm is a `200` even when some ids are skipped — see
[Known gaps](#known-gaps--client-impact). Retrieval:

```bash
curl http://localhost:3001/api/uploads/<uploadId>/url -H "Authorization: Bearer $TOKEN"
curl http://localhost:3001/api/uploads -H "Authorization: Bearer $TOKEN"
```

`GET /api/uploads/:id/url` returns `{ "url", "contentType", "originalName" }` with
`meta.expiresInSeconds: 900`. The URL lasts 15 minutes and carries an `inline`
content-disposition so browsers render it rather than downloading it. Unknown ids
are `404` `UPLOAD_NOT_FOUND`; non-UUIDs are `400` `INVALID_ID`.

`GET /api/uploads` lists only **your own confirmed** uploads, newest first, each as
`{ id, user_id, original_name, object_key, content_type, size_bytes, status,
created_at, updated_at }`.

### Manage users

```bash
curl -X POST http://localhost:3001/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"vol@example.com","password":"...","name":"Jane","role":"volunteer"}'
```

`role` defaults to `"volunteer"`; the only valid values are `"admin"` and
`"volunteer"`. Users come back as
`{ id, email, name, is_active, created_at, updated_at }` — password hashes are
omitted at the query level and never appear in any response. A duplicate email is
`409` `USER_EMAIL_TAKEN`, an unknown role `400` `USER_ROLE_UNKNOWN`, and an unknown
id `404` `USER_NOT_FOUND`. `PATCH` accepts any of
`{ email?, name?, password?, is_active? }`.

## Errors

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

`details` appears only on `4xx` and carries client-safe context — field names,
allowed values, what was received. On `5xx` it is always omitted and the message is
deliberately generic; the full detail, including the underlying cause chain, goes to
the server log under the same `requestId`.

### Error codes

Codes are **append-only**: once published, a code is never renamed and never reused
for a different condition, so it is safe to switch on. The authoritative list is
`src/http/error.codes.ts`.

| Code | Status | Meaning |
| --- | :---: | --- |
| `ROUTE_NOT_FOUND` | 404 | No endpoint matches the method and path. |
| `MALFORMED_JSON` | 400 | The request body is not valid JSON, or was truncated. |
| `PAYLOAD_TOO_LARGE` | 413 | The request body exceeds the 1 MB limit. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | The request body encoding is not supported. |
| `RATE_LIMITED` | 429 | Rate limit exceeded; see the `RateLimit-*` headers. |
| `INTERNAL_ERROR` | 500 | Unclassified server failure. |
| `INVALID_ID` | 400 | A path parameter or id field is not a UUID. |
| `MISSING_FIELD` | 400 | A required body field is absent. |
| `INVALID_FIELD` | 400 | A body or query field has a bad type or value. |
| `UNAUTHORIZED` | 401 | No credentials supplied, or the auth header is malformed. |
| `TOKEN_INVALID` | 401 | The JWT is malformed or its signature does not verify. |
| `TOKEN_EXPIRED` | 401 | The JWT is well-formed but past expiry — log in again. |
| `FORBIDDEN` | 403 | Authenticated, but the role level is insufficient. |
| `INVALID_CREDENTIALS` | 401 | Unknown email or wrong password (indistinguishable by design). |
| `ACCOUNT_INACTIVE` | 403 | The account exists but `is_active` is false. |
| `AUTH_LOGIN_FAILED` | 500 | Login failed for a server-side reason. |
| `PMN_SCUM_RULE_VIOLATION` | 400 | A scum invariant was violated — see [Scum rules](#scum-rules). |
| `PMN_RECORD_NOT_FOUND` | 404 | No PMN record with that id. |
| `PMN_SCUM_PHOTO_NOT_FOUND` | 404 | The upload is not currently referenced as a scum photo, or does not exist. |
| `PMN_READ_FAILED`, `PMN_CREATE_FAILED`, `PMN_UPDATE_FAILED`, `PMN_DELETE_FAILED`, `PMN_SCUM_LOOKUP_FAILED` | 500 | PMN operation failed server-side. |
| `PHOSPHATE_RECORD_NOT_FOUND` | 404 | No phosphate record with that id. |
| `PHOSPHATE_LOCATION_UNKNOWN` | 400 | No sampling location matches the `loc_id` supplied. |
| `PHOSPHATE_READ_FAILED`, `PHOSPHATE_CREATE_FAILED`, `PHOSPHATE_UPDATE_FAILED`, `PHOSPHATE_DELETE_FAILED` | 500 | Phosphate operation failed server-side. |
| `USER_NOT_FOUND` | 404 | No user with that id. |
| `USER_EMAIL_TAKEN` | 409 | That email is already registered. |
| `USER_ROLE_UNKNOWN` | 400 | The requested role is not configured on this server. |
| `USERS_READ_FAILED`, `USERS_CREATE_FAILED`, `USERS_UPDATE_FAILED`, `USERS_DELETE_FAILED` | 500 | User operation failed server-side. |
| `UPLOAD_NOT_FOUND` | 404 | No upload with that id. |
| `UPLOADS_PRESIGN_FAILED`, `UPLOADS_CONFIRM_FAILED`, `UPLOADS_DOWNLOAD_URL_FAILED`, `UPLOADS_LIST_FAILED` | 500 | Upload operation failed server-side. |

## Data dictionary

The database spans four Postgres schemas — `pmn`, `camas`, `watershed_field_data`,
and `users` — defined in `prisma/schema.prisma`. All primary keys are UUIDs. Two
tables are served as data endpoints today.

### `pmn_combined_field_data`

The canonical merged PMN dataset: staff field data unioned with verified volunteer
input. Served by `/api/pmn/combined-field-data`. Every column except `id` and
`has_scum` is nullable.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID (PK) | Always present; DB-generated. Do not send on POST. |
| `sample_date` | date | When the sample was taken. |
| `sample_time` | time | Time of day of the sample. |
| `sampling_site` | string | Site name. |
| `air_temperature` | decimal | Unit not recorded in the schema — confirm with LWC. |
| `weather` | string | Free text. |
| `wind_direction` | string | Free text, e.g. `"NW"`. |
| `wind_speed` | string | Free text, e.g. `"5-10 mph"`. |
| `barometeric_pressure` | decimal | Column name is misspelled in the DB; preserved as-is. |
| `water_temperature` | decimal | Unit not recorded in the schema — confirm with LWC. |
| `ph` | decimal | pH units. |
| `dissolved_oxygen` | decimal | Unit not recorded in the schema — confirm with LWC. |
| `conductivity` | decimal | Unit not recorded in the schema — confirm with LWC. |
| `total_dissolved_solids` | decimal | Unit not recorded in the schema — confirm with LWC. |
| `salt_ppt` | decimal | Salinity, parts per thousand. |
| `aphanizomenon` | string | Cyanobacteria genus — free-text presence/abundance. |
| `dolichospermum` | string | Cyanobacteria genus. |
| `microcystis` | string | Cyanobacteria genus. |
| `planktothrix` | string | Cyanobacteria genus. |
| `raphidiopsis` | string | Cyanobacteria genus. |
| `woronichinia` | string | Cyanobacteria genus. |
| `secchi` | decimal | Secchi-disk depth (water clarity). Unit not recorded in the schema. |
| `general_comments` | string | Free text. |
| `photos` | string[] | Upload ids of general photos. Defaults to `[]`. Require an account to view. |
| `has_scum` | boolean | Scum (toxic algae) observed. Not nullable; defaults to `false`; always `true` when `scum_photos` is non-empty. |
| `scum_photos` | string[] | Upload ids of scum photos. Defaults to `[]`. Max 10, confirmed `image/*` only, disjoint from `photos`. **Publicly viewable.** |

**Units are not stored anywhere in this dataset.** They follow the instruments LWC
volunteers use; confirm them with LWC before publishing derived figures.

### `watershed_field_data.phosphate_data`

Lab phosphate results, served by `/api/phosphate-data` with the sampling site joined
in under a nested `locations` key. Numeric columns here are `double precision`, so
they serialize as JSON **numbers**; `notes` is the only nullable column.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID (PK) | DB-generated. Do not send on POST. |
| `lab_case_file_number` | int | Lab case/file number. |
| `loc_id` | UUID (FK → `locations`) | Sampling site. Send as a **flat `loc_id`** on POST/PATCH. |
| `measurement_date` | date | When the sample was taken. |
| `measurement_time` | time | Time of day of the sample. |
| `analysis_date` | date | When the lab ran the analysis. |
| `analyte_id` | string(50) | Analyte code, e.g. `"PO4"`. |
| `analyte_level` | float | Measured concentration, in `unit`. |
| `unit` | string(50) | Unit for `analyte_level`, e.g. `"mg/L"`. |
| `notes` | string \| null | Free text. The only nullable column. |
| `photos` | string[] | Upload ids. Defaults to `[]`. |
| `locations` | object | Nested joined site: `loc_id`, `loc_name`, `latitude`, `longitude`, `description`. Read-only on responses. |

### Tables without endpoints

<details>
<summary><code>camas_city_data</code> — Camas city water readings (schema: <code>camas</code>)</summary>

UUID PK `id`. Columns: `location`, `date`, `time`, `depth`, `temp_c`, `do_percent`,
`do_mg_l`, `spc_us_cm`, `c_us_cm`, `tds_mg_l`, `ph`, `chl_a_rfu`, `phyc_rfu`,
`turbidity` — all decimal except `location`, `date`, and `time`. Modeled in Prisma,
not served.
</details>

<details>
<summary><code>watershed_field_data.locations</code> — sampling sites</summary>

`loc_id` (UUID PK), `loc_name`, `latitude`, `longitude` (floats), `description`.
One-to-many with `phosphate_data`. Not served on its own — rows are reachable only
as the nested `locations` object on `GET /api/phosphate-data`. Seed them with
`npm run seed:locations`.
</details>

<details>
<summary><code>users</code> schema — RBAC and uploads</summary>

- `users` — `id`, `email` (unique), `password_hash`, `name`, `is_active`,
  `created_at`, `updated_at`.
- `roles` — `id`, `name` (unique), `description`. Seeded with `admin`, `volunteer`,
  `guest`, though only the first two are assignable through the API.
- `permissions` — `id`, `name` (unique), `description`. Seeded with `data:read`,
  `data:write`, `data:update`, `data:delete`, `users:manage`.
- `user_roles`, `role_permissions` — join tables with composite PKs and cascading
  FKs.
- `upload` — `id`, `user_id` (FK, cascade delete), `original_name`, `object_key`
  (unique S3 key, `uploads/<userId>/<uuid>.<ext>`), `content_type`, `size_bytes`,
  `status` (`"pending"` | `"confirmed"`), `created_at`, `updated_at`.
</details>

## Middleware chain

The order each request passes through, which explains most surprising responses:

```
requestId      → helmet → cors
 → GET /health   public, unauthenticated, never rate-limited; the one un-enveloped body
 → express.json  1 MB limit
 → /auth/login   public, 10 req / 15 min
 → /api          rateLimiter → optional JWT → feature routers (requireRole per route)
 → notFoundHandler → errorHandler
```

## Known gaps & client impact

| Gap | Effect | What to do about it |
| --- | --- | --- |
| No pagination or sorting on either data endpoint | `GET` returns the entire table on every call; payload size grows without bound as data accumulates | Fetch once, then sort and page locally. Cache aggressively. |
| `hasScum` is the only filter | Every other view (by site, by date range, by genus) must be computed client-side | Filter the full result set locally. |
| `meta` never carries pagination | There is no cursor or total-pages hint to read | Do not write code that probes for `meta.pagination`. |
| No role-reassignment endpoint | A user's role is fixed at `POST /api/users`; changing it needs direct DB access | Do not build role-editing UI. Offer account creation only. |
| Partial upload confirms return `200` | Unknown ids, already-confirmed ids, and other users' ids are silently skipped, not rejected | Compare `meta.confirmed` against `meta.requested`; never treat `200` as "all confirmed". |
| `camas_city_data` and standalone `locations` have no endpoints | A sampling-site picker cannot be populated from the API, and Camas readings are unreachable | Harvest `loc_id` values from `GET /api/phosphate-data`, or seed and query them out of band. |
| Login is capped at 10 attempts / 15 min per IP, hardcoded | Repeated failed logins — or several people behind one NAT — will start returning `429` | Surface `RATE_LIMITED` distinctly in the login UI and honor `RateLimit-Reset`. |
| `GET /api/uploads/:id/url` has no ownership check (intentional) | Any volunteer can fetch any upload's URL | Do not treat an upload id as a secret or as an access-control boundary. |
| No upload-deletion endpoint, and `pending` uploads are never cleaned up | A user cannot remove a photo once uploaded | Omit delete affordances for uploads; expect orphaned S3 objects. |
| `permissions` / `role_permissions` are seeded but never read | Authorization uses only the role names in the JWT | Build against the three role levels, not against a permissions model the API ignores. |
| Rate limiting is in-memory | Limits are per-instance, so counts reset on restart and diverge across instances | Treat `429` as advisory, not deterministic. A multi-instance deploy needs a shared store such as Redis. |
| Logging is `console.error` + JSON | No log levels or transport; correlation is by `requestId` only | Always capture and report `error.requestId` when escalating a `500`. |
| The RDS server certificate is not verified | Connections are encrypted but not authenticated (production only; local Docker runs without SSL) | Server-side concern; no client action. |
| No automated tests | `package.json` has a `"test": "test"` placeholder and `scripts/` holds only `deploy.sh` | Verify changes manually with the curl examples above. |
| No record history or versioning | The API always serves current state; corrections overwrite silently | Record the download date alongside any published analysis. |

---

## Further reading

- [`docs/production.md`](./docs/production.md) — EC2 deployment: Node, PM2, nginx,
  TLS, migrations, and troubleshooting.
- [`docs/s3-setup.md`](./docs/s3-setup.md) — bucket creation, the required CORS
  configuration, the least-privilege IAM policy, and upload troubleshooting.

## License

MIT — see [LICENSE](./LICENSE). Author: Terris Becker.
