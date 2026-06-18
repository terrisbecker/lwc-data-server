import type { Request, Response, NextFunction } from "express";
import { PmnServiceError } from "../pmn/pmn.service";

/**
 * Central Express error-handling middleware. Must be registered after all
 * routes. Logs the error server-side and returns a generic JSON body so
 * internal details (e.g. DB errors held in `cause`) are never leaked to clients.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // If the response has already started, defer to Express's default handler.
  if (res.headersSent) {
    next(err);
    return;
  }

  console.error(err);

  if (err instanceof PmnServiceError) {
    res.status(500).json({ error: { message: "Failed to fetch PMN data" } });
    return;
  }

  res.status(500).json({ error: { message: "Internal server error" } });
}
