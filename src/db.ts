import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

/** Shared Prisma client instance for the whole app. */
export const prisma = new PrismaClient({ adapter });
