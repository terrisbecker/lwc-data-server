import "dotenv/config";
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
