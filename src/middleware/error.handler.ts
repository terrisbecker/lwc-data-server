import type { Request, Response, NextFunction } from "express";
import { PmnServiceError } from "../pmn/pmn.service";
import { AuthServiceError } from "../auth/auth.service";
import { UsersServiceError } from "../users/users.service";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  console.error(err);

  if (err instanceof PmnServiceError) {
    res.status(500).json({ error: { message: "Internal server error" } });
    return;
  }

  if (err instanceof AuthServiceError) {
    res.status(500).json({ error: { message: "Internal server error" } });
    return;
  }

  if (err instanceof UsersServiceError) {
    res.status(500).json({ error: { message: "Internal server error" } });
    return;
  }

  res.status(500).json({ error: { message: "Internal server error" } });
}
