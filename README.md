# LWC Data Server

**Version:** 2.0.0

The HTTP/JSON API behind the Lacamas Watershed Council's (LWC) field-monitoring
data. It publishes the observations LWC volunteers and staff collect on Lacamas
Lake and its tributaries, and accepts new records from authorized contributors.

Two datasets are served today:

- **PMN combined field data:** the phytoplankton monitoring network dataset:
  water-quality readings (temperature, pH, dissolved oxygen, conductivity, Secchi
  depth and more) alongside observed presence of six **cyanobacteria genera**, plus
  a scum (harmful-algal-bloom) flag and photographs.
- **Phosphate data:** laboratory phosphate results joined to the sampling
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

# Part 1: Using the data

This part assumes no programming background beyond a willingness to paste a
command into a terminal or a URL into a spreadsheet. Everything here uses the
production server at `https://api.lacamaswatershed.org`.

## The two primary endpoints

| Dataset | URL |
| --- | --- |
| PMN combined field data | <https://api.lacamaswatershed.org/api/pmn/combined-field-data> |
| Phosphate lab results | <https://api.lacamaswatershed.org/api/phosphate-data> |

You can open either one in a web browser and you will see the whole dataset as JSON.
Firefox and Chrome both render JSON in a collapsible viewer, which is often clean enough
for a quick look at the data shape.

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

## Getting the data into a tool you use

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
   decimals and serialize as strings; `"ph": "7.40"`, not `7.4`. This preserves
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

## Citing and caveats

These are **volunteer- and staff-collected field observations**, published as
recorded. They are not laboratory-certified except where the phosphate dataset
carries a `lab_case_file_number`. Cyanobacteria genus entries are visual field
identifications, not cell counts. Please contact LWC before using the data in a
regulatory or public-health determination, and note the date you downloaded it.
Records are corrected and added over time, and the API always serves the current
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

---

# Part 3 — API reference

**The full reference is the OpenAPI contract, browsable at
[api.lacamaswatershed.org/docs](https://api.lacamaswatershed.org/docs).** It lists
every endpoint, request body, response shape, field description and error code. The
raw OpenAPI 3.1 file is at
[`/openapi.yaml`](https://api.lacamaswatershed.org/openapi.yaml), so you can
generate a client from it rather than hand-writing request types. The contract is
enforced: a request that doesn't match it is rejected with `400`.

## License

MIT — see [LICENSE](./LICENSE). Author: Terris Becker.
