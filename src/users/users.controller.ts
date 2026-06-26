import type { Request, Response, NextFunction } from "express";
import {
  listUsers,
  createNewUser,
  patchUser,
  removeUser,
  UserNotFoundError,
  DuplicateEmailError,
} from "./users.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ROLES = new Set(["admin", "volunteer"]);

export async function handleGetUsers(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await listUsers();
    res.json({ data });
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
      res.status(400).json({ error: { message: "email and password are required" } });
      return;
    }

    if (role !== undefined && !VALID_ROLES.has(role)) {
      res.status(400).json({ error: { message: `role must be one of: ${[...VALID_ROLES].join(", ")}` } });
      return;
    }

    const data = await createNewUser({ email, password, name, role });
    res.status(201).json({ data });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      res.status(409).json({ error: { message: "Email already in use" } });
      return;
    }
    next(err);
  }
}

export async function handleUpdateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!UUID_RE.test(req.params.id as string)) {
    res.status(400).json({ error: { message: "Invalid id" } });
    return;
  }

  try {
    const data = await patchUser(
      req.params.id as string,
      req.body as { email?: string; password?: string; name?: string; is_active?: boolean },
    );
    res.json({ data });
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      res.status(404).json({ error: { message: "User not found" } });
      return;
    }
    if (err instanceof DuplicateEmailError) {
      res.status(409).json({ error: { message: "Email already in use" } });
      return;
    }
    next(err);
  }
}

export async function handleDeleteUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!UUID_RE.test(req.params.id as string)) {
    res.status(400).json({ error: { message: "Invalid id" } });
    return;
  }

  try {
    await removeUser(req.params.id as string);
    res.status(204).send();
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      res.status(404).json({ error: { message: "User not found" } });
      return;
    }
    next(err);
  }
}
