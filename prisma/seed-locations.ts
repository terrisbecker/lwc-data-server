import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { locations } from "./seed_data/locations";

const useSsl = process.env.DATABASE_SSL !== "false";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`Seeding watershed_field_data.locations (${locations.length} provided)...`);

  let inserted = 0;
  let skipped = 0;

  for (const loc of locations) {
    // loc_name has no unique constraint, so guard against duplicates by name to
    // keep this script idempotent across re-runs.
    const existing = await prisma.locations.findFirst({
      where: { loc_name: loc.loc_name },
      select: { loc_id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.locations.create({
      data: {
        loc_name: loc.loc_name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        description: loc.description ?? null,
      },
    });
    inserted++;
  }

  console.log(`Locations seed complete. Inserted ${inserted}, skipped ${skipped} (already present).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
