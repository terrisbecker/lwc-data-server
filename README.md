# LWC Data Server

**Version:** 2.0.0

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

Reading data is **open to the public.** All API requests are rate limited to block bots from causing congestion on the server.
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

The [API docs](https://api.lacamaswatershed.org/docs) describe every field, its type,
and its units (open a `PmnRecord` or `PhosphateRecord` schema).

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
each write. See [Authentication and roles](#authentication-and-roles) in Part 3 and
the [API docs](https://api.lacamaswatershed.org/docs) for the exact calls.

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
[API docs](https://api.lacamaswatershed.org/docs) list every error code each
endpoint can return.

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

npm run openapi:lint    # lint openapi.yaml (Redocly)
npm run openapi:types   # regenerate src/types/openapi.d.ts from openapi.yaml
npm run contract:check  # drift check: spec vs routes, roles, error codes, types
npm run contract        # lint + drift check — run before every PR
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
- **`openapi.yaml` is the contract.** Requests are validated against it, so a route
  change means: update the spec, add `validate` to the route (after `requireRole`),
  run `npm run openapi:types`, then `npm run contract`. Controllers type `req.body`
  with `RequestBody<path, method>` from `src/http/contract.ts`.

**There is no unit test suite.** `"test": "test"` in `package.json` is a
placeholder. `npm run contract` is the automated check: it lints the spec and diffs
it against the routes, roles, error codes and generated types. Point it at a running
server for read-only live checks too:

```bash
BASE_URL=http://localhost:3001 npm run contract:check
# also log in and check volunteer/admin GETs:
BASE_URL=http://localhost:3001 CONTRACT_EMAIL=… CONTRACT_PASSWORD=… npm run contract:check
```

Verify write paths manually against a local server (request bodies are in the
[API docs](https://api.lacamaswatershed.org/docs), or `/docs` locally) and say in the
PR what you ran.

## Deployment

[`docs/production.md`](./docs/production.md) documents the production setup:
EC2, PM2, nginx, Let's Encrypt TLS, and running migrations against RDS.

---

# Part 3 — API reference

**The full reference is the OpenAPI contract, browsable at
[api.lacamaswatershed.org/docs](https://api.lacamaswatershed.org/docs).** It lists
every endpoint, request body, response shape, field description and error code. The
raw OpenAPI 3.1 file is at
[`/openapi.yaml`](https://api.lacamaswatershed.org/openapi.yaml), so you can
generate a client from it rather than hand-writing request types. The contract is
enforced: a request that doesn't match it is rejected with `400`.

This section covers only what a contract can't express well: the conventions that
apply everywhere, the multi-step flows, and the known gaps.

## Conventions

- **Base URL:** `https://api.lacamaswatershed.org`. A local server listens on
  `http://localhost:3001` (per `.env.example`).
- **Envelope:** success is `{ data, message?, meta? }`; errors are
  `{ error: { message, code, details?, requestId } }`. **Branch on `error.code`**,
  never on the message. Codes are append-only, so they are safe to switch on.
- **Request ids:** every response has an `X-Request-Id` header, repeated as
  `error.requestId`. Quote it when reporting a problem; it identifies the request in
  the server logs.
- **Validation errors** are `400` with `details.errors` listing `{ field, message }`:
  `MISSING_FIELD` for an absent required field, `INVALID_ID` where a UUID was
  expected, `INVALID_FIELD` for anything else (including unknown fields such as
  `id`). Writes must send `Content-Type: application/json` and stay under 1 MB.
- **Rate limits** are per IP: 100 requests / 15 min on `/api` and **10 / 15 min on
  `/auth`**. Both return `429 RATE_LIMITED`; wait for `RateLimit-Reset` seconds.
- **Numbers and dates:** PMN measurements are exact decimals sent as strings
  (`"7.40"`), while phosphate values are plain numbers. Dates and times are full
  ISO-8601 timestamps; see [Reading the values correctly](#reading-the-values-correctly).
- **CORS:** browser origins must be on the server's `CORS_ALLOWED_ORIGINS`
  allowlist. curl, R, Python and Excel aren't affected.

## Authentication and roles

`POST /auth/login` exchanges an email and password for a JWT, valid for 8 hours with
no refresh. Send it as `Authorization: Bearer <token>`:

```bash
TOKEN=$(curl -s -X POST https://api.lacamaswatershed.org/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"..."}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
```

No header means guest access, and reads still work. A token that is present but
malformed or expired is always `401` (`TOKEN_INVALID` / `TOKEN_EXPIRED`), even on a
public route; it is never downgraded to guest.

| Role | Read data | Create records | Edit / delete records | Uploads | Manage users |
| --- | :---: | :---: | :---: | :---: | :---: |
| **guest** (no token) | ✓ | — | — | — | — |
| **volunteer** | ✓ | ✓ | — | ✓ | — |
| **admin** | ✓ | ✓ | ✓ | ✓ | ✓ |

Each operation in the docs names its minimum role as `x-required-role`. Guests can't
view uploads, with one deliberate exception: PMN scum photos, served by
`GET /api/pmn/scum-photos/{uploadId}/url` while a record lists them.

## Uploading a photo

Three steps. The file goes straight to S3 and never passes through this server.

```bash
# 1. Request presigned URLs (up to 10 files, each up to 10 MB; the URLs last 5 minutes)
curl -X POST https://api.lacamaswatershed.org/api/uploads/presigned-urls \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"files":[{"filename":"photo.jpg","contentType":"image/jpeg","sizeBytes":204800}]}'

# 2. PUT the raw bytes to each presignedUrl: no Authorization header, no multipart,
#    and the Content-Type must match what you declared
curl -X PUT "<presignedUrl>" -H "Content-Type: image/jpeg" --data-binary @photo.jpg

# 3. Confirm, then reference the uploadId in a record's photos or scum_photos
curl -X POST https://api.lacamaswatershed.org/api/uploads/confirm \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"uploadIds":["<uploadId>"]}'
```

A confirm returns `200` even when some ids are skipped, so compare `meta.confirmed`
with `meta.requested`. The declared `sizeBytes` is checked by this server but not by
S3. Only `image/*` uploads can be used as PMN scum photos; the scum rules are in the
`PmnInput` schema in the docs.

## Known gaps & client impact

| Gap | Effect | What to do about it |
| --- | --- | --- |
| No pagination or sorting | `GET` returns the whole table on every call | Fetch once, then sort, filter and page locally. Cache aggressively. |
| `hasScum` is the only filter | Views by site, date range or genus must be computed client-side | Filter the full result set locally. |
| No role-reassignment endpoint | A user's role is fixed at creation | Don't build role-editing UI. |
| Partial upload confirms return `200` | Unknown, already-confirmed and other users' ids are skipped silently | Compare `meta.confirmed` with `meta.requested`. |
| No `locations` or `camas_city_data` endpoints | A site picker can't be populated directly | Collect `loc_id` values from `GET /api/phosphate-data`. |
| Login is capped at 10 attempts / 15 min per IP | Several people behind one NAT can hit `429` | Show `RATE_LIMITED` distinctly and honor `RateLimit-Reset`. |
| `GET /api/uploads/{id}/url` has no ownership check (intentional) | Any volunteer can fetch any upload | Don't treat an upload id as a secret. |
| No upload deletion; `pending` uploads are never cleaned up | A photo can't be removed once uploaded | Omit delete affordances for uploads. |
| Rate limiting is in-memory | Counts reset when the server restarts | Treat `429` as advisory, not exact. |
| No record history | Corrections overwrite silently | Record the download date with any published analysis. |

---

## Further reading

- [`docs/production.md`](./docs/production.md) — EC2 deployment: Node, PM2, nginx,
  TLS, migrations, and troubleshooting.
- [`docs/s3-setup.md`](./docs/s3-setup.md) — bucket creation, the required CORS
  configuration, the least-privilege IAM policy, and upload troubleshooting.

## License

MIT — see [LICENSE](./LICENSE). Author: Terris Becker.
