import type { Request, Response, NextFunction } from "express";
import { loginUser } from "./auth.service";
import { ok } from "../http/respond";
import { requireString } from "../http/validate";
import { BadRequestError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";

export async function handleLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      throw new BadRequestError("email and password are required", {
        code: ErrorCodes.MISSING_FIELD,
        details: { required: ["email", "password"] },
      });
    }

    const result = await loginUser(requireString(email, "email"), password);
    ok(res, result, "Signed in.");
  } catch (err) {
    // Every error this path can raise now carries its own status and code, so the
    // central handler maps it — no instanceof ladder needed here.
    next(err);
  }
}
