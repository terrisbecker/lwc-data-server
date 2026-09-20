import type { Request, Response, NextFunction } from "express";
import { listUsers, createNewUser, patchUser, removeUser } from "./users.service";
import { ok, created, noContent, list } from "../http/respond";
import { requireUuidParam, requireOneOf } from "../http/validate";
import { BadRequestError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";

const VALID_ROLES = ["admin", "volunteer"] as const;

export async function handleGetUsers(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await listUsers();
    list(res, data, "Retrieved users.");
  } catch (err) {
    next(err);
  }
}

export async function handleCreateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password, name, role } = req.body as {
      email: string;
      password: string;
      name?: string;
      role?: string;
    };

    if (!email || !password) {
      throw new BadRequestError("email and password are required", {
        code: ErrorCodes.MISSING_FIELD,
        details: { required: ["email", "password"] },
      });
    }

    if (role !== undefined) requireOneOf(role, VALID_ROLES, "role");

    const data = await createNewUser({ email, password, name, role });
    created(res, data, "User created.", { id: data.id });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = requireUuidParam(req.params.id);
    const data = await patchUser(
      id,
      req.body as { email?: string; password?: string; name?: string; is_active?: boolean },
    );
    ok(res, data, "User updated.", { id });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await removeUser(requireUuidParam(req.params.id));
    noContent(res);
  } catch (err) {
    next(err);
  }
}
