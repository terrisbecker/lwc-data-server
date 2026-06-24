import "dotenv/config";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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
 */
export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: { message: "Unauthorized" } });
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
  } catch {
    res.status(401).json({ error: { message: "Unauthorized" } });
  }
}
