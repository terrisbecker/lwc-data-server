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
import { ApiError, InternalError, NotFoundError, ConflictError, BadRequestError } from "../http/api.error";
import { ErrorCodes, type ErrorCode } from "../http/error.codes";

// `message` names the failed operation for the log; the client gets the
// per-call-site publicMessage instead.
export class UsersServiceError extends InternalError {
  constructor(
    message: string,
    cause?: unknown,
    code: ErrorCode = ErrorCodes.USERS_READ_FAILED,
    publicMessage = "The request could not be completed.",
  ) {
    super(message, { code, publicMessage, cause });
    this.name = "UsersServiceError";
  }
}

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super("User not found", { code: ErrorCodes.USER_NOT_FOUND });
    this.name = "UserNotFoundError";
  }
}

export class DuplicateEmailError extends ConflictError {
  constructor() {
    super("Email already in use", { code: ErrorCodes.USER_EMAIL_TAKEN });
    this.name = "DuplicateEmailError";
  }
}

const BCRYPT_ROUNDS = 12;

export async function listUsers(): Promise<SafeUser[]> {
  try {
    return await getAllUsers();
  } catch (cause) {
    throw new UsersServiceError(
      "Failed to fetch users",
      cause,
      ErrorCodes.USERS_READ_FAILED,
      "Users could not be retrieved.",
    );
  }
}

export async function getUser(id: string): Promise<SafeUser> {
  try {
    const user = await getUserById(id);
    if (!user) throw new UserNotFoundError();
    return user;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new UsersServiceError(
      "Failed to fetch user",
      err,
      ErrorCodes.USERS_READ_FAILED,
      "The user could not be retrieved.",
    );
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
      // A client-supplied role that isn't configured on this server is a 400,
      // not a 500. The role name is echoed from the request, so it leaks nothing.
      throw new BadRequestError("The requested role is not configured on this server.", {
        code: ErrorCodes.USER_ROLE_UNKNOWN,
        details: { field: "role", received: roleName },
      });
    }

    const password_hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    return await createUser({ email: body.email, password_hash, name: body.name, roleId: role.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicateEmailError();
    }
    if (err instanceof ApiError) throw err;
    throw new UsersServiceError(
      "Failed to create user",
      err,
      ErrorCodes.USERS_CREATE_FAILED,
      "The request could not be completed while creating the user.",
    );
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
    if (err instanceof ApiError) throw err;
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicateEmailError();
    }
    throw new UsersServiceError(
      "Failed to update user",
      err,
      ErrorCodes.USERS_UPDATE_FAILED,
      "The request could not be completed while updating the user.",
    );
  }
}

export async function removeUser(id: string): Promise<SafeUser> {
  try {
    const user = await deleteUser(id);
    if (!user) throw new UserNotFoundError();
    return user;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new UsersServiceError(
      "Failed to delete user",
      err,
      ErrorCodes.USERS_DELETE_FAILED,
      "The request could not be completed while deleting the user.",
    );
  }
}
