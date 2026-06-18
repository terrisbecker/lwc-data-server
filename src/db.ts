import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// AWS RDS requires SSL/TLS. Without this the connection is rejected with
// SQLSTATE 28000 ("no pg_hba.conf entry ... no encryption").
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/** Shared Prisma client instance for the whole app. */
export const prisma = new PrismaClient({ adapter });
