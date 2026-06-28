# Production Deployment Guide

This guide covers deploying the LWC Data Server on an AWS EC2 instance (Ubuntu)
backed by an AWS RDS PostgreSQL database in the same VPC.

---

## Prerequisites

- An EC2 instance running Ubuntu (22.04 LTS or later recommended), in the same
  VPC as the RDS instance.
- An RDS PostgreSQL instance accessible from the EC2 security group.
- SSH access to the EC2 instance (your `.pem` key pair).
- The RDS endpoint, port, database name, and credentials.

---

## 1. Connect to the EC2 instance

```bash
ssh -i /path/to/your-key.pem ubuntu@<EC2_PUBLIC_IP_OR_DNS>
```

If you use a bastion host or Session Manager, adjust accordingly.

---

## 2. Install system dependencies

```bash
sudo apt update && sudo apt upgrade -y

# curl and gnupg are needed for the NodeSource install
sudo apt install -y curl gnupg git
```

### Install Node.js 22 (LTS) via NodeSource

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node -v    # v22.x.x
npm -v     # 10.x.x
```

### Install PM2 (process manager)

```bash
sudo npm install -g pm2
```

---

## 3. Clone the repository

```bash
cd /home/ubuntu
git clone https://github.com/terrisbecker/lwc-data-server.git
cd lwc-data-server
```

If the repo is private, authenticate first (a GitHub personal access token or
deploy key is the simplest approach for a server):

```bash
# Deploy key approach: add the EC2 instance's public key to the repo's deploy keys
ssh-keygen -t ed25519 -C "ec2-lwc" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# Paste the output into GitHub → repo Settings → Deploy Keys → Add deploy key
git clone git@github.com:terrisbecker/lwc-data-server.git
```

---

## 4. Install dependencies

```bash
npm ci
```

> `npm ci` installs from `package-lock.json` exactly (reproducible build).
> Install **all** deps here (including devDeps) — TypeScript and `@types/*`
> packages are required to compile in step 7. After the build you can optionally
> run `npm prune --omit=dev` to remove them and save disk space.

---

## 5. Create and populate `.env`

Never commit secrets. Create the env file directly on the server:

```bash
cp .env.example .env
nano .env
```

Fill in every value:

```dotenv
PORT=3001

# RDS connection string — host is the RDS endpoint, not localhost
DATABASE_URL=postgresql://<db_user>:<db_password>@<rds_endpoint>:5432/<db_name>

# Leave DATABASE_SSL unset (or set to "true") for RDS — SSL is required.
# Do NOT set DATABASE_SSL=false in production.

# Generate with: openssl rand -hex 32
JWT_SECRET=<64-character-hex-string>
JWT_EXPIRES_IN=8h

# Used only by `npm run seed` — can be omitted after first seed
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=<strong-password>

# Comma-separated list of allowed browser origins
CORS_ALLOWED_ORIGINS=https://your-frontend-domain.com

# 1 if behind a single ALB; 0 if EC2 is internet-facing with no proxy
TRUST_PROXY=1

# Rate limiting (optional — defaults are fine to start)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

Restrict the file so only the current user can read it:

```bash
chmod 600 .env
```

### Generate a JWT secret

```bash
openssl rand -hex 32
```

Paste the output as `JWT_SECRET`.

---

## 6. Verify RDS connectivity

Before running the app, confirm the EC2 instance can reach the database:

```bash
# Install psql client if not already present
sudo apt install -y postgresql-client

psql "$DATABASE_URL" -c "SELECT 1;"
```

If you get `connection refused` or `no pg_hba.conf entry`:

- Confirm the RDS security group has an inbound rule allowing port 5432 from
  the EC2 instance's security group (not 0.0.0.0/0).
- Confirm `DATABASE_SSL` is not set to `false` — RDS rejects unencrypted
  connections with SQLSTATE `28000`, which looks like a permissions error but is
  actually an SSL requirement.

---

## 7. Build TypeScript

```bash
# Generate the Prisma client FIRST — tsc imports types from generated/prisma/client
npx prisma generate

npm run build
```

`npx prisma generate` must run before `tsc` because source files import types
from `generated/prisma/client` (gitignored). Running `tsc` first produces ~10
"Cannot find module" errors.

After building you can optionally prune devDependencies to save disk space:

```bash
npm prune --omit=dev
```

---

## 8. Run database migrations

Apply the schema to the RDS database (idempotent — safe to re-run):

```bash
npx prisma migrate deploy
```

This creates all tables across the four Postgres schemas (`pmn`, `camas`,
`watershed_field_data`, `users`).

---

## 9. Seed the database

Seed roles, permissions, and the initial admin user (idempotent — safe to re-run):

```bash
npm run seed
```

`ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` in `.env` control the admin
credentials. You can change the admin password via `PATCH /api/users/:id` or by
re-seeding after updating `.env`.

---

## 10. Start the server with PM2

```bash
pm2 start dist/src/index.js --name lwc-data-server
```

Check it is running:

```bash
pm2 status
pm2 logs lwc-data-server --lines 50
```

Smoke-test the health endpoint:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{ "status": "ok", "uptime": 1.23, "timestamp": "2026-01-01T00:00:00.000Z" }
```

---

## 11. Configure PM2 to start on boot

```bash
pm2 startup
# PM2 prints a `sudo env PATH=...` command — run it exactly as printed
pm2 save
```

After this, PM2 will restart the server automatically after a reboot.

---

## 12. Set up nginx as a reverse proxy

nginx sits in front of the Node process, accepting traffic on port 80 and
forwarding it to `localhost:3001`. This keeps the app port off the public
internet and lets you add TLS termination later without touching the app.

### Install nginx

```bash
sudo apt install -y nginx
```

### Create a site config

```bash
sudo nano /etc/nginx/sites-available/lwc-data-server
```

Paste the following (replace `your-domain.com` with your EC2 hostname or public
IP if you do not have a domain yet — `_` matches any name):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        proxy_read_timeout 60s;
    }
}
```

### Enable the site and reload nginx

```bash
# Remove the default placeholder
sudo rm /etc/nginx/sites-enabled/default

# Symlink the new config into sites-enabled
sudo ln -s /etc/nginx/sites-available/lwc-data-server /etc/nginx/sites-enabled/

# Verify the config is valid
sudo nginx -t

# Apply it
sudo systemctl reload nginx
```

### Enable nginx on boot

```bash
sudo systemctl enable nginx
```

### Smoke-test through nginx

```bash
curl http://localhost/health
```

Expected response (same as hitting port 3001 directly):

```json
{ "status": "ok", "uptime": 1.23, "timestamp": "2026-01-01T00:00:00.000Z" }
```

> **`TRUST_PROXY`** — with nginx forwarding requests, Express sees `127.0.0.1`
> as the client IP unless you set `TRUST_PROXY=1` in `.env`. That tells the rate
> limiter and any IP-based logic to read `X-Forwarded-For` instead.

---

## 13. Configure the firewall (ufw)

With nginx handling port 80, there is no need to expose port 3001 publicly.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx HTTP'    # opens port 80
sudo ufw enable
sudo ufw status
```

Do **not** add a rule for port 3001 — the app should only be reachable via nginx
on localhost.

If you are placing an ALB in front of the EC2, restrict port 80 to the ALB's
security group in the AWS console instead of opening it with ufw.

---

## Updating the server

```bash
cd /home/ubuntu/lwc-data-server
git pull
npm ci
npx prisma generate
npm run build
npm prune --omit=dev        # optional: remove devDeps after build
npx prisma migrate deploy   # only if there are new migrations
pm2 restart lwc-data-server
```

---

## Environment variable reference

| Variable | Required | Default | Notes |
| --- | :---: | --- | --- |
| `DATABASE_URL` | **yes** | — | Postgres connection string. Missing → silent `localhost:5432` fallback → `ECONNREFUSED`. |
| `DATABASE_SSL` | no | SSL on | Set to `false` only for a plain local Postgres. Leave unset for RDS. |
| `JWT_SECRET` | **yes** | — | Server refuses to start if unset. Min 32 random chars. |
| `JWT_EXPIRES_IN` | no | `8h` | Token lifetime (`ms` format: `8h`, `1d`, `30m`). |
| `ADMIN_SEED_EMAIL` | seed only | — | Initial admin email. Only read by `npm run seed`. |
| `ADMIN_SEED_PASSWORD` | seed only | — | Initial admin password. Only read by `npm run seed`. |
| `PORT` | no | `3001` | HTTP port the server listens on. |
| `CORS_ALLOWED_ORIGINS` | no | _(deny all)_ | Comma-separated origins: `https://app.example.com`. |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` | 15-minute window in ms. |
| `RATE_LIMIT_MAX` | no | `100` | Requests per window per IP. |
| `TRUST_PROXY` | no | `0` | Proxy hops to trust for real client IP. Set to `1` behind an ALB. |

---

## Troubleshooting

### Server exits immediately

```bash
pm2 logs lwc-data-server --lines 100
```

Common causes:

- **`JWT_SECRET` is unset** — the server throws at startup (fail-closed by
  design). Set it in `.env`.
- **`DATABASE_URL` is wrong** — the pg adapter falls back to `localhost:5432`
  and queries fail with `ECONNREFUSED`. Check the RDS endpoint and credentials.
- **Port already in use** — another process is on port 3001. Check with
  `sudo lsof -i :3001`.

### Database connection refused / SSL error

RDS requires SSL. If `DATABASE_SSL=false` is set, remove it (or leave
`DATABASE_SSL` unset). The `SQLSTATE 28000` error that appears when SSL is
disabled looks like a permissions error but is an SSL requirement — see
`.claude/notes/rds-ssl-hardening.md`.

### `prisma generate` fails after clone

`generated/prisma/` is gitignored. Always run `npx prisma generate` on a fresh
clone before building or starting the server.

### `403 Forbidden` on write endpoints

The JWT is valid but the user's role is too low. Volunteers can POST; only admins
can PATCH and DELETE. Check the role assigned to the user via `GET /api/users`
(admin token required).
