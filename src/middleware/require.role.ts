import type { Request, Response, NextFunction } from "express";

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
      res.status(401).json({ error: { message: "Unauthorized" } });
      return;
    }

    const userMaxLevel = req.user.roles.reduce((max, role) => {
      const level = ROLE_HIERARCHY[role as Role] ?? 0;
      return Math.max(max, level);
    }, 0);

    if (userMaxLevel < ROLE_HIERARCHY[minimumRole]) {
      res.status(403).json({ error: { message: "Forbidden" } });
      return;
    }

    next();
  };
}
