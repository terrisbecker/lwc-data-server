import bcrypt from "bcryptjs";
import { Prisma } from "../../generated/prisma/client";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  findRoleByName,
  type SafeUser,
} from "./users.queries";

export class UsersServiceError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "UsersServiceError";
    this.cause = cause;
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("Email already in use");
    this.name = "DuplicateEmailError";
  }
}

const BCRYPT_ROUNDS = 12;

export async function listUsers(): Promise<SafeUser[]> {
  try {
    return await getAllUsers();
  } catch (cause) {
    throw new UsersServiceError("Failed to fetch users", cause);
  }
}

export async function getUser(id: string): Promise<SafeUser> {
  try {
    const user = await getUserById(id);
    if (!user) throw new UserNotFoundError();
    return user;
  } catch (err) {
    if (err instanceof UserNotFoundError) throw err;
    throw new UsersServiceError("Failed to fetch user", err);
  }
}

export async function createNewUser(body: {
  email: string;
  password: string;
  name?: string;
  role?: string;
}): Promise<SafeUser> {
  try {
    const roleName = body.role ?? "volunteer";
    const role = await findRoleByName(roleName);
    if (!role) {
      throw new UsersServiceError(`Role '${roleName}' not found`);
    }

    const password_hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    return await createUser({ email: body.email, password_hash, name: body.name, roleId: role.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicateEmailError();
    }
    if (err instanceof UsersServiceError || err instanceof DuplicateEmailError) throw err;
    throw new UsersServiceError("Failed to create user", err);
  }
}

export async function patchUser(
  id: string,
  body: { email?: string; password?: string; name?: string; is_active?: boolean },
): Promise<SafeUser> {
  try {
    const data: { email?: string; password_hash?: string; name?: string; is_active?: boolean } = {};
    if (body.email !== undefined) data.email = body.email;
    if (body.name !== undefined) data.name = body.name;
    if (body.is_active !== undefined) data.is_active = body.is_active;
    if (body.password !== undefined) data.password_hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    const user = await updateUser(id, data);
    if (!user) throw new UserNotFoundError();
    return user;
  } catch (err) {
    if (err instanceof UserNotFoundError) throw err;
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicateEmailError();
    }
    throw new UsersServiceError("Failed to update user", err);
  }
}

export async function removeUser(id: string): Promise<SafeUser> {
  try {
    const user = await deleteUser(id);
    if (!user) throw new UserNotFoundError();
    return user;
  } catch (err) {
    if (err instanceof UserNotFoundError) throw err;
    throw new UsersServiceError("Failed to delete user", err);
  }
}
