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

  // Log only the error's own fields — not the chained `.cause`, which may
  // contain DB connection details or raw query text.
  const entry =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { message: String(err) };
  console.error(JSON.stringify(entry));

  if (
    err instanceof PmnServiceError ||
    err instanceof AuthServiceError ||
    err instanceof UsersServiceError
  ) {
    res.status(500).json({ error: { message: "Internal server error" } });
    return;
  }

  res.status(500).json({ error: { message: "Internal server error" } });
}
