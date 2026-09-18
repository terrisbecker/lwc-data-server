import "dotenv/config";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";
import { fail } from "../http/respond";
import { redact } from "../http/log";

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Refusing to start — configure JWT_SECRET in the environment.",
  );
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

/**
 * Optional JWT extraction middleware. Runs on all /api routes.
 *
 * No Authorization header → passes through (guest access).
 * Valid Bearer token → sets req.user = { id, email, roles }.
 * Malformed / expired / tampered token → 401 (never treated as guest).
 *
 * The response message stays a flat "Unauthorized" in every failure case; only
 * `error.code` distinguishes an expired token from an invalid one, which lets a
 * front end choose between a silent re-login and a hard sign-out without widening
 * what the body reveals.
 */
export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  if (!authHeader.startsWith("Bearer ")) {
    fail(res, new UnauthorizedError("Unauthorized"), req.requestId);
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
    req.user = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
    next();
  } catch (err) {
    // Log why the token failed — the previous bare `catch {}` made an expired
    // token indistinguishable from a tampered one in production. The token itself
    // is never logged.
    const name = err instanceof Error ? err.name : "UnknownError";
    const expired = name === "TokenExpiredError";
    console.error(
      JSON.stringify({
        level: "warn",
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: 401,
        code: expired ? ErrorCodes.TOKEN_EXPIRED : ErrorCodes.TOKEN_INVALID,
        name,
        message: err instanceof Error ? redact(err.message) : String(err),
      }),
    );

    fail(
      res,
      new UnauthorizedError("Unauthorized", {
        code: expired ? ErrorCodes.TOKEN_EXPIRED : ErrorCodes.TOKEN_INVALID,
      }),
      req.requestId,
    );
  }
}
