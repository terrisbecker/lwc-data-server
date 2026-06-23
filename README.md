# LWC Data Server

A read-only HTTP/JSON API serving water-quality and watershed field data for the
LWC project. It is a thin, secured layer in front of a PostgreSQL (AWS RDS)
database, built with Express 5, Prisma 7, and TypeScript.

This README is written for **front-end developers and AI agents** building UIs on
top of this data. It documents what endpoints exist, the exact shape of every
response, the data domain (water-quality / cyanobacteria monitoring), and how to
run the server locally.

---

## TL;DR for front-end / agent consumers

- **Base URL:** `http://<host>:3000` (default port `3000`).
- **Auth:** every `/api/*` request must send an `x-api-key: <secret>` header.
  Missing/invalid → `401`.
- **CORS:** the browser origin must be in the server's allowlist
  (`CORS_ALLOWED_ORIGINS`). Ask whoever runs the server to add yours.
- **One data endpoint today:** `GET /api/pmn/combined-field-data` returns the
  full PMN combined field-data table as `{ "data": [ ... ] }`.
- **Health probe:** `GET /health` is public (no key, no rate limit).
- **Success shape:** `{ "data": <payload> }`. **Error shape:**
  `{ "error": { "message": "..." } }` (generic — never includes DB details).
- **Numbers come back as strings.** PostgreSQL `DECIMAL` columns serialize as
  JSON strings (e.g. `"7.40"`), not numbers. Parse them client-side.
- **Dates/times are ISO timestamps.** `DATE` and `TIME` columns serialize as full
  ISO-8601 strings with an epoch placeholder for the missing half — see
  [Field types & gotchas](#field-types--gotchas).

---

## API reference

### `GET /health`

Public, unauthenticated, not rate-limited. Intended for load-balancer probes.

```json
{
  "status": "ok",
  "uptime": 1234.56,
  "timestamp": "2026-06-18T20:00:00.000Z"
}
```

### `GET /api/pmn/combined-field-data`

Returns **every row** of the `pmn_combined_field_data` table (no pagination,
filtering, or sorting yet — see [Roadmap](#roadmap--known-gaps)). At the time of
writing this is ~1000+ rows.

**Headers:** `x-api-key: <your key>` (required).

**Response `200`:**

```json
{
  "data": [
    {
      "id": "some-id",
      "sample_date": "2025-07-14T00:00:00.000Z",
      "sample_time": "1970-01-01T09:30:00.000Z",
      "sampling_site": "Round Lake - North",
      "air_temperature": "24.0",
      "weather": "Sunny",
      "wind_direction": "NW",
      "wind_speed": "5-10 mph",
      "barometeric_pressure": "30.12",
      "water_temperature": "22.5",
      "ph": "7.80",
      "dissolved_oxygen": "8.40",
      "conductivity": "120",
      "total_dissolved_solids": "78",
      "salt_ppt": "0.1",
      "aphanizomenon": "Yes",
      "dolichospermum": "No",
      "microcystis": "Elevated",
      "planktothrix": "Yes",
      "raphidiopsis": "No",
      "woronichinia": "No",
      "general_comments": "Light surface scum near inlet.",
      "secchi": "1.20",
      "source": "Google Sheet"
    }
  ]
}
```

Every field except `id` may be `null`. Treat all measurement fields as nullable
in the UI. See the [field table](#pmn_combined_field_data-the-served-table) for
types and meaning.

**Errors:**

| Status | When | Body |
| --- | --- | --- |
| `401` | Missing or invalid `x-api-key` | `{ "error": { "message": "Unauthorized" } }` |
| `429` | Rate limit exceeded | `{ "error": { "message": "Too many requests" } }` |
| `500` | DB/query failure | `{ "error": { "message": "Failed to fetch PMN data" } }` |
| `404` | Unknown route | Express default HTML 404 |

> Note: `429` responses also carry standard `RateLimit-*` headers
> (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).

### Quick test

```bash
# Health (no key)
curl http://localhost:3000/health

# PMN data (key required)
curl http://localhost:3000/api/pmn/combined-field-data \
  -H "x-api-key: $API_KEY"
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

The database is **introspected, not authored, by this repo** — Prisma's schema
was generated from an existing RDS database. There are two Postgres schemas:
`public` (PMN + Camas city data) and `watershed_field_data` (locations +
phosphate lab data).

> **Only `pmn_combined_field_data` is exposed via the API today.** The other
> tables exist in the database and in the Prisma schema (so models/types are
> generated for them) but have no endpoints yet. They are documented here so
> front-end/agent work can anticipate future endpoints.

### `pmn_combined_field_data` (the served table)

The canonical, merged PMN dataset — the union of staff field data and
(verified) volunteer input. This is what `GET /api/pmn/combined-field-data`
returns.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | string (PK) | Always present; the only non-null field. |
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
| `general_comments` | string | Free text. |
| `secchi` | decimal | Secchi-disk depth (water clarity). |
| `source` | string | Provenance of the row (e.g. staff vs. volunteer). |

### Other tables (not yet exposed)

<details>
<summary><code>pmn_field_data</code> — raw staff field samples (schema: public)</summary>

Same measurement columns as the combined table, keyed by `id_uuid` (UUID PK,
DB-generated). `sample_date` and `sampling_site` are required. No `source`
column.
</details>

<details>
<summary><code>pmn_volunteer_input</code> — raw volunteer submissions (schema: public)</summary>

Integer PK `id`. Note the **column names differ** from the combined table:
`air_temp`, `baro_pressure`, `water_temp`, `salt` (vs. `air_temperature`,
`barometeric_pressure`, `water_temperature`, `salt_ppt`). Adds
`verification_code` and `created_at` (timestamp). Also has a nullable `id_uuid`.
</details>

<details>
<summary><code>camas_city_data</code> — Camas city water readings (schema: public)</summary>

Integer PK `id`. Columns: `location`, `date`, `time`, `depth`, `temp_c`,
`do_percent`, `do_mg_l`, `spc_us_cm`, `c_us_cm`, `tds_mg_l`, `ph`, `chl_a_rfu`,
`phyc_rfu`, `turbidity` (all decimal except location/date/time).
</details>

<details>
<summary><code>watershed_field_data.locations</code> — sampling sites (schema: watershed_field_data)</summary>

`loc_id` (int PK), `loc_name`, `latitude`, `longitude` (floats), `description`.
Has a one-to-many relation to `phosphate_data`. Useful for mapping if/when
exposed.
</details>

<details>
<summary><code>watershed_field_data.phosphate_data</code> — lab phosphate results (schema: watershed_field_data)</summary>

`id` (int PK), `lab_id`, `lab_case_file_number`, `loc_id` (FK → `locations`),
`measurement_date`, `measurement_time`, `analysis_date`, `analyte_id`,
`analyte_level` (float), `unit`, `notes`.
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

`src/index.ts` wires it together: it mounts each feature router (e.g.
`/api/pmn`) and registers the central error middleware **last**. The error
middleware logs the full error server-side but returns only a generic JSON body,
so DB internals never reach clients. **PMN (`src/pmn/`) is the reference
implementation** to copy when adding a new feature.

### Request lifecycle / middleware chain

```
helmet            security headers, strips X-Powered-By
 → cors           allowlist from CORS_ALLOWED_ORIGINS
 → /health        (registered BEFORE /api — public, no auth, no rate limit)
 → rateLimiter    per-IP, mounted on /api BEFORE auth so unauth floods are capped
 → apiKeyAuth     requires x-api-key; fails closed (process won't start w/o API_KEY)
 → feature routers (/api/pmn, ...)
 → errorHandler   (last) logs full error, returns generic body
```

- **`apiKeyAuth`** (`src/middleware/api.key.ts`) compares `x-api-key` against
  `API_KEY` with a constant-time compare, and **throws at startup if `API_KEY`
  is unset** (fail-closed).
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
  middleware/
    api.key.ts              x-api-key auth (constant-time, fail-closed)
    rate.limit.ts           per-IP rate limiter
    error.handler.ts        central error middleware (generic responses)
  pmn/                      reference feature
    pmn.queries.ts          Prisma access — getAllCombinedFieldData()
    pmn.service.ts          getCombinedFieldData() + PmnServiceError
    pmn.controller.ts       handleGetCombinedFieldData()
    pmn.routes.ts           pmnRouter → GET /combined-field-data
prisma/
  schema.prisma             introspected DB models (2 schemas)
  migrations/0_init/        baseline migration SQL
generated/prisma/           Prisma client output (gitignored, generated)
scripts/
  test-pmn-query.ts         standalone runner that hits the DB directly
  test-query.sh             wrapper that runs the above
prisma.config.ts            Prisma CLI config (schema + datasource URL)
nodemon.json                dev runner (ts-node on src)
tsconfig.json               TS config (target ES2020, CommonJS)
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

Then edit `.env`. You must set at minimum `DATABASE_URL` and `API_KEY`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes** | — | Postgres connection string. If unset, the pg adapter silently falls back to `localhost:5432` and queries fail with `ECONNREFUSED`. |
| `DATABASE_SSL` | no | _(SSL on)_ | Set to `false` to disable SSL/TLS on the DB connection. Required for a plain local Postgres (e.g. the Docker container); leave unset for AWS RDS, which requires SSL. |
| `API_KEY` | **yes** | — | Shared secret for the `x-api-key` header. **Server refuses to start if unset.** |
| `PORT` | no | `3000` | HTTP port. |
| `CORS_ALLOWED_ORIGINS` | no | _(empty = deny all cross-origin)_ | Comma-separated origin allowlist, e.g. `http://localhost:5173`. |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` (15 min) | Rate-limit window. |
| `RATE_LIMIT_MAX` | no | `100` | Max requests per window per IP. |
| `TRUST_PROXY` | no | `0` | Number of trusted proxy hops in front of the app. |

Generate a strong API key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
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

Apply the schema to the fresh database (creates the `public` and
`watershed_field_data` schemas + tables from the baseline migration):

```bash
npx prisma generate         # if not already done
npx prisma migrate deploy
```

Then run the app as usual (`npm run dev`). Managing the container:

```bash
docker compose ps           # check health
docker compose down         # stop (keeps data in the named volume)
docker compose down -v      # stop and wipe the database
```

The tables start empty, so endpoints return `{ "data": [] }` until you load
data — this still confirms end-to-end connectivity to the local DB.

### Run

```bash
npm run dev      # nodemon + ts-node, watches src/
npm run build    # tsc → dist/
npm start        # node dist/src/index.js (run build first)
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
4. `*.routes.ts` — an Express `Router`.
5. In `src/index.ts`, mount the router under `/api/<feature>` **before** the
   `errorHandler`, and add a branch in `error.handler.ts` if the new
   `*ServiceError` needs a distinct status/message.

---

## Tech stack

- **Runtime/framework:** Node.js, Express 5, TypeScript (CommonJS, ES2020 target).
- **Data:** Prisma 7 with the `@prisma/adapter-pg` driver adapter over `pg`,
  against PostgreSQL on AWS RDS.
- **Security:** `helmet`, `cors`, `express-rate-limit`, custom constant-time API
  key auth.
- **Dev:** `nodemon` + `ts-node`.

### Database SSL note

`src/db.ts` connects with `ssl: { rejectUnauthorized: false }` because AWS RDS
requires SSL/TLS. This currently does **not** verify the RDS server certificate
— see `.claude/notes/rds-ssl-hardening.md` for the deferred task to verify the
server cert. Read that note before touching DB SSL/connection config.

---

## Roadmap / known gaps

- **Read-only, single endpoint.** Only `pmn_combined_field_data` is exposed.
  Camas, volunteer, raw field, locations, and phosphate tables are modeled but
  not served.
- **No pagination, filtering, or sorting** — the PMN endpoint returns the whole
  table every call. Front-ends should expect to fetch once and filter/sort
  client-side for now.
- **Single-instance rate limiting** (in-memory store).
- **RDS cert not verified** (see SSL note above).

---

## License

MIT — see [LICENSE](./LICENSE). Author: Terris Becker.
