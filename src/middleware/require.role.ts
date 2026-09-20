import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError, ForbiddenError } from "../http/api.error";
import { fail } from "../http/respond";

type Role = "admin" | "volunteer";

const ROLE_HIERARCHY: Record<Role, number> = {
  volunteer: 1,
  admin: 2,
};

/**
 * Middleware factory enforcing a minimum role level.
 *
 * requireRole("volunteer") → allows volunteer and admin
 * requireRole("admin")     → allows admin only
 *
 * Returns 401 if req.user is undefined (unauthenticated).
 * Returns 403 if the user's highest role is below the required level.
 */
export function requireRole(minimumRole: Role) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      fail(res, new UnauthorizedError("Unauthorized"), req.requestId);
      return;
    }

    const userMaxLevel = req.user.roles.reduce((max, role) => {
      const level = ROLE_HIERARCHY[role as Role] ?? 0;
      return Math.max(max, level);
    }, 0);

    if (userMaxLevel < ROLE_HIERARCHY[minimumRole]) {
      fail(res, new ForbiddenError("Forbidden"), req.requestId);
      return;
    }

    next();
  };
}
