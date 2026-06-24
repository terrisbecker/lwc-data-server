import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";
import type { users } from "../../generated/prisma/client";

export type SafeUser = Omit<users, "password_hash">;

const omitPasswordHash = { password_hash: true } as const;

export async function getAllUsers(): Promise<SafeUser[]> {
  return prisma.users.findMany({
    omit: omitPasswordHash,
    orderBy: { created_at: "asc" },
  });
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  return prisma.users.findUnique({
    where: { id },
    omit: omitPasswordHash,
  });
}

export async function createUser(data: {
  email: string;
  password_hash: string;
  name?: string;
  roleId: string;
}): Promise<SafeUser> {
  return prisma.users.create({
    data: {
      email: data.email,
      password_hash: data.password_hash,
      name: data.name,
      user_roles: {
        create: { role_id: data.roleId },
      },
    },
    omit: omitPasswordHash,
  });
}

export async function updateUser(
  id: string,
  data: {
    email?: string;
    password_hash?: string;
    name?: string;
    is_active?: boolean;
  },
): Promise<SafeUser | null> {
  try {
    return await prisma.users.update({
      where: { id },
      data,
      omit: omitPasswordHash,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return null;
    }
    throw e;
  }
}

export async function deleteUser(id: string): Promise<SafeUser | null> {
  try {
    return await prisma.users.delete({
      where: { id },
      omit: omitPasswordHash,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return null;
    }
    throw e;
  }
}

export async function findRoleByName(name: string): Promise<{ id: string } | null> {
  return prisma.roles.findUnique({
    where: { name },
    select: { id: true },
  });
}
