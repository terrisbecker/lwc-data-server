import type { Request, Response, NextFunction } from "express";
import { loginUser, InvalidCredentialsError, InactiveUserError } from "./auth.service";

export async function handleLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: { message: "email and password are required" } });
      return;
    }

    const result = await loginUser(email, password);
    res.json({ data: result });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: { message: "Invalid email or password" } });
      return;
    }
    if (err instanceof InactiveUserError) {
      res.status(403).json({ error: { message: "Account is inactive" } });
      return;
    }
    next(err);
  }
}
