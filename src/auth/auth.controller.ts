import type { Request, Response, NextFunction } from "express";
import { loginUser } from "./auth.service";
import { ok } from "../http/respond";
import type { RequestBody } from "../http/contract";

export async function handleLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // The contract guarantees both are non-empty strings.
    const { email, password } = req.body as RequestBody<"/auth/login", "post">;
    const result = await loginUser(email, password);
    ok(res, result, "Signed in.");
  } catch (err) {
    next(err);
  }
}
