import type { Request, Response, NextFunction } from "express";
import { listUsers, createNewUser, patchUser, removeUser } from "./users.service";
import { ok, created, noContent, list } from "../http/respond";
import type { PathParams, RequestBody } from "../http/contract";

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
    const data = await createNewUser(req.body as RequestBody<"/api/users", "post">);
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
    const { id } = req.params as PathParams<"/api/users/{id}">;
    const data = await patchUser(id, req.body as RequestBody<"/api/users/{id}", "patch">);
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
    const { id } = req.params as PathParams<"/api/users/{id}">;
    await removeUser(id);
    noContent(res);
  } catch (err) {
    next(err);
  }
}
