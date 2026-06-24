import { prisma } from "../db";
import type { users } from "../../generated/prisma/client";

export type UserWithRoles = users & {
  user_roles: Array<{
    roles: { name: string };
  }>;
};

export async function findUserByEmail(email: string): Promise<UserWithRoles | null> {
  return prisma.users.findUnique({
    where: { email },
    include: {
      user_roles: {
        include: {
          roles: {
            select: { name: true },
          },
        },
      },
    },
  });
}
