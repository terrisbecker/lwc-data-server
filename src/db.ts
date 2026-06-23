import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// AWS RDS requires SSL/TLS. Without this the connection is rejected with
// SQLSTATE 28000 ("no pg_hba.conf entry ... no encryption"). A plain local
// Postgres (e.g. the docker-compose container) has no TLS, so set
// DATABASE_SSL=false there to avoid "server does not support SSL connections".
const useSsl = process.env.DATABASE_SSL !== "false";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

/** Shared Prisma client instance for the whole app. */
export const prisma = new PrismaClient({ adapter });
