import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";

/**
 * Read and validate the configured API key once, at module init, so the server
 * fails closed: if `API_KEY` is unset/empty the process refuses to start rather
 * than silently accepting all traffic.
 */
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error(
    "API_KEY is not set. Refusing to start — configure API_KEY in the environment.",
  );
}

const expectedKey = Buffer.from(API_KEY);

/**
 * Constant-time comparison of the supplied key against the configured one.
 * `timingSafeEqual` throws on length mismatch, so guard length first; the
 * length check itself is not secret (the configured key length is fixed).
 */
function isValidKey(provided: string): boolean {
  const providedBuf = Buffer.from(provided);
  if (providedBuf.length !== expectedKey.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedKey);
}

/**
 * Express middleware requiring a valid `x-api-key` header. Responds with a
 * generic 401 for both missing and invalid keys so the failure mode is not
 * distinguishable to clients. Response shape matches `error.handler.ts`.
 */
export function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const provided = req.header("x-api-key");

  if (!provided || !isValidKey(provided)) {
    res.status(401).json({ error: { message: "Unauthorized" } });
    return;
  }

  next();
}
