# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                  # nodemon + ts-node, watches src/ — primary dev workflow
npm run build                # tsc → dist/
npm start                    # node dist/src/index.js (run build first)
npm run seed                 # (re-)seed roles, permissions, and admin user — idempotent

npx prisma generate          # regenerate Prisma client into generated/prisma/ (required after schema changes)
npx prisma migrate deploy    # apply migrations to the database

./scripts/test-query.sh      # smoke-test DB connectivity via ts-node (bypasses HTTP)
```

No test framework is configured — `"test": "test"` in `package.json` is a placeholder.

## Architecture

API features follow a layered pattern, one directory per feature under `src/`:

`*.queries.ts` (Prisma data access) → `*.service.ts` (business logic; wraps DB
errors in a typed `*ServiceError` carrying the original as `cause`) →
`*.controller.ts` (Express handler; responds with `{ data }`, forwards errors
via `next()`) → `*.routes.ts` (Express `Router`).

`src/index.ts` mounts each feature router and registers
`src/middleware/error.handler.ts` **last**. The error middleware logs the full
error server-side but returns only a generic JSON body (`{ error: { message } }`)
so DB internals never reach clients. PMN is the reference implementation
(`src/pmn/`, endpoint `GET /api/pmn/combined-field-data`).

Note: `tsconfig` targets ES2020, which predates the `Error` `{ cause }`
constructor option — service errors assign `cause` manually as a property.

## Middleware chain

```
helmet              → cors (allowlist from CORS_ALLOWED_ORIGINS)
 → GET /health        public, no auth, no rate limit (load-balancer probe)
 → /auth/login        public login; rateLimiter applied, no JWT required
 → /api               rateLimiter → jwtAuth → feature routers
 → errorHandler       last — generic response body, full error logged server-side
```

**`jwtAuth`** (`src/middleware/jwt.auth.ts`): optional JWT extraction on all `/api`
routes. No `Authorization` header → guest (passes through). Valid `Bearer` token →
sets `req.user = { id, email, roles }`. Present but invalid/expired token → 401
(never silently downgraded to guest). **Throws at startup if `JWT_SECRET` is
unset** (fail-closed).

**`requireRole(minimumRole)`** (`src/middleware/require.role.ts`): per-route
middleware factory. Role hierarchy: `volunteer = 1`, `admin = 2`. Returns 401 if
unauthenticated, 403 if role level is insufficient. Applied per-route — `GET`
routes on data endpoints are public by default (no `requireRole`).

**`rateLimiter`** (`src/middleware/rate.limit.ts`): in-memory per-IP store (fine
for a single instance; a multi-instance deploy needs a shared store like Redis).
Defaults: 100 req / 15 min. `TRUST_PROXY` (default `0`) controls how many proxy
hops to trust for real client IP — set to hop count in deployment (e.g. `1` behind
a single ALB).

## Auth system

`POST /auth/login` (public) returns a JWT signed with `JWT_SECRET`. The JWT
payload is `{ sub: userId, email, roles: string[] }`. Token lifetime is
`JWT_EXPIRES_IN` (default `8h`). The `users` Postgres schema holds the RBAC
tables: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`.
Password hashes use bcrypt; the login path always runs `bcrypt.compare` even for
unknown users to prevent user-enumeration via timing.

`req.user` is typed via `src/types/express.d.ts` (Express namespace augmentation).

## Env

`src/index.ts` loads env via `import "dotenv/config"` as its **first** line,
before the import chain reaches `src/db.ts` (which reads `process.env.DATABASE_URL`
at module init). If `DATABASE_URL` is unset, the pg adapter silently falls back to
`localhost:5432` and queries fail with `ECONNREFUSED` — that's a missing-env
symptom, not an RDS/SSL problem.

Required: `DATABASE_URL`, `JWT_SECRET` (server throws at startup if either is
unset). See README for the full variable table.

## Local Docker setup

```bash
docker compose up -d         # start Postgres (app runs on host)
# .env: DATABASE_URL=postgresql://lwc:lwc@localhost:5432/lwc_data  DATABASE_SSL=false
npx prisma migrate deploy    # create tables
npm run seed                 # seed roles and admin user
npm run dev
```

## Prisma / generated client

The Prisma client is output to `generated/prisma/` (gitignored). Always run
`npx prisma generate` after schema changes. The schema spans four Postgres schemas:
`pmn`, `camas`, `watershed_field_data`, `users`. Only `pmn_combined_field_data` and
the `users` tables are exposed as API endpoints today.

## Local notes & deferred work

- `.claude/notes/rds-ssl-hardening.md` — deferred task: verify the RDS server cert in
  `src/db.ts` instead of `ssl: { rejectUnauthorized: false }`. Read this before
  touching database SSL/connection config.
- `.claude/summaries/` — per-feature implementation summaries (e.g.
  `pmn-endpoint.md`).
