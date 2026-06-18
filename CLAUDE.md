# CLAUDE.md

## Architecture

API features follow a layered pattern, one directory per feature under `src/`:

`*.queries.ts` (Prisma data access) → `*.service.ts` (business logic; wraps DB
errors in a typed `*ServiceError` carrying the original as `cause`) →
`*.controller.ts` (Express handler; responds with `{ data }`, forwards errors
via `next()`) → `*.routes.ts` (Express `Router`).

`src/index.ts` mounts each feature router (e.g. `/api/pmn`) and registers
`src/middleware/error.handler.ts` **last**. The error middleware logs the full
error server-side but returns only a generic JSON body (`{ error: { message } }`)
so DB internals never reach clients. PMN is the reference implementation
(`src/pmn/`, endpoint `GET /api/pmn/combined-field-data`).

Note: `tsconfig` targets ES2020, which predates the `Error` `{ cause }`
constructor option — service errors assign `cause` manually as a property.

Env: `src/index.ts` loads env via `import "dotenv/config";` as its **first**
line, before the import chain reaches `src/db.ts` (which reads
`process.env.DATABASE_URL` at module init). If `DATABASE_URL` is unset the pg
adapter silently falls back to `localhost:5432` and queries fail with
`ECONNREFUSED` — that's a missing-env symptom, not an RDS/SSL problem.

## Local notes & deferred work

- `.claude/notes/rds-ssl-hardening.md` — deferred task: verify the RDS server cert in
  `src/db.ts` instead of `ssl: { rejectUnauthorized: false }`. Read this before
  touching database SSL/connection config.
- `.claude/summaries/` — per-feature implementation summaries (e.g.
  `pmn-endpoint.md`).
