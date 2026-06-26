import "dotenv/config";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const useSsl = process.env.DATABASE_SSL !== "false";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});
const prisma = new PrismaClient({ adapter });

const BCRYPT_ROUNDS = 12;

function parseCSV(content: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let i = 0;
  const len = content.length;

  function parseField(): string {
    if (i >= len) return "";
    if (content[i] === '"') {
      i++;
      let field = "";
      while (i < len) {
        if (content[i] === '"') {
          i++;
          if (i < len && content[i] === '"') {
            field += '"';
            i++;
          } else {
            break;
          }
        } else {
          field += content[i++];
        }
      }
      return field;
    }
    let field = "";
    while (i < len && content[i] !== "," && content[i] !== "\n" && content[i] !== "\r") {
      field += content[i++];
    }
    return field;
  }

  const headers: string[] = [];
  while (i < len && content[i] !== "\n" && content[i] !== "\r") {
    headers.push(parseField());
    if (i < len && content[i] === ",") i++;
  }
  if (i < len && content[i] === "\r") i++;
  if (i < len && content[i] === "\n") i++;

  while (i < len) {
    const row: Record<string, string> = {};
    let col = 0;
    while (i < len) {
      const field = parseField();
      if (col < headers.length) row[headers[col]] = field;
      col++;
      if (i >= len || content[i] === "\n" || content[i] === "\r") {
        if (i < len && content[i] === "\r") i++;
        if (i < len && content[i] === "\n") i++;
        break;
      }
      if (content[i] === ",") i++;
    }
    if (col > 1) rows.push(row);
  }
  return rows;
}

function nullStr(val: string): string | null {
  const s = val.trim();
  return s === "" ? null : s;
}

function nullDecimal(val: string): string | null {
  const s = val.trim();
  return s === "" ? null : s;
}

function nullDate(val: string): Date | null {
  const s = val.trim();
  if (s === "") return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function nullTime(val: string): Date | null {
  const s = val.trim();
  if (s === "") return null;
  const d = new Date(`1970-01-01T${s}Z`);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  console.log("Seeding roles...");
  const adminRole = await prisma.roles.upsert({
    where: { name: "admin" },
    create: { name: "admin", description: "Full access to all endpoints and user management" },
    update: {},
  });
  const volunteerRole = await prisma.roles.upsert({
    where: { name: "volunteer" },
    create: { name: "volunteer", description: "GET and POST on data endpoints" },
    update: {},
  });
  await prisma.roles.upsert({
    where: { name: "guest" },
    create: { name: "guest", description: "Unauthenticated read-only access" },
    update: {},
  });

  console.log("Seeding permissions...");
  const permissionDefs = [
    { name: "data:read",    description: "Read data endpoints" },
    { name: "data:write",   description: "Create records via data endpoints" },
    { name: "data:update",  description: "Update records via data endpoints" },
    { name: "data:delete",  description: "Delete records via data endpoints" },
    { name: "users:manage", description: "Create, read, update, delete users" },
  ];

  const permissions: Record<string, { id: string }> = {};
  for (const perm of permissionDefs) {
    permissions[perm.name] = await prisma.permissions.upsert({
      where: { name: perm.name },
      create: perm,
      update: {},
      select: { id: true },
    });
  }

  console.log("Seeding role_permissions...");
  for (const permName of Object.keys(permissions)) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: adminRole.id,
          permission_id: permissions[permName].id,
        },
      },
      create: { role_id: adminRole.id, permission_id: permissions[permName].id },
      update: {},
    });
  }

  for (const permName of ["data:read", "data:write"]) {
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: {
          role_id: volunteerRole.id,
          permission_id: permissions[permName].id,
        },
      },
      create: { role_id: volunteerRole.id, permission_id: permissions[permName].id },
      update: {},
    });
  }

  console.log("Seeding admin user...");
  const adminEmail = process.env.ADMIN_SEED_EMAIL;
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set to seed the admin user.");
  }

  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

  const adminUser = await prisma.users.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, password_hash: passwordHash, name: "Admin", is_active: true },
    update: {},
  });

  await prisma.user_roles.upsert({
    where: {
      user_id_role_id: { user_id: adminUser.id, role_id: adminRole.id },
    },
    create: { user_id: adminUser.id, role_id: adminRole.id },
    update: {},
  });

  const existingCount = await prisma.pmn_combined_field_data.count();
  if (existingCount === 0) {
    console.log("Seeding pmn_combined_field_data from CSV...");
    const csvPath = path.join(__dirname, "seed_data", "seed-data.csv");
    const csvRows = parseCSV(fs.readFileSync(csvPath, "utf-8"));

    const records = csvRows.map((row) => ({
      sample_date: nullDate(row.sample_date ?? ""),
      sample_time: nullTime(row.sample_time ?? ""),
      sampling_site: nullStr(row.sampling_site ?? ""),
      air_temperature: nullDecimal(row.air_temperature ?? ""),
      weather: nullStr(row.weather ?? ""),
      wind_direction: nullStr(row.wind_direction ?? ""),
      wind_speed: nullStr(row.wind_speed ?? ""),
      barometeric_pressure: nullDecimal(row.barometeric_pressure ?? ""),
      water_temperature: nullDecimal(row.water_temperature ?? ""),
      ph: nullDecimal(row.ph ?? ""),
      dissolved_oxygen: nullDecimal(row.dissolved_oxygen ?? ""),
      conductivity: nullDecimal(row.conductivity ?? ""),
      total_dissolved_solids: nullDecimal(row.total_dissolved_solids ?? ""),
      salt_ppt: nullDecimal(row.salt_ppt ?? ""),
      aphanizomenon: nullStr(row.aphanizomenon ?? ""),
      dolichospermum: nullStr(row.dolichospermum ?? ""),
      microcystis: nullStr(row.microcystis ?? ""),
      planktothrix: nullStr(row.planktothrix ?? ""),
      raphidiopsis: nullStr(row.raphidiopsis ?? ""),
      woronichinia: nullStr(row.woronichinia ?? ""),
      general_comments: nullStr(row.general_comments ?? ""),
      secchi: nullDecimal(row.secchi ?? ""),
    }));

    await prisma.pmn_combined_field_data.createMany({ data: records });
    console.log(`Inserted ${records.length} pmn records.`);
  } else {
    console.log(`Skipping pmn CSV seed — ${existingCount} records already exist.`);
  }

  console.log(`Seed complete. Admin user: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
