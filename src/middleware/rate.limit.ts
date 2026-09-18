import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { TooManyRequestsError } from "../http/api.error";
import { fail } from "../http/respond";

const tooManyRequests = (req: Request, res: Response) =>
  fail(res, new TooManyRequestsError("Too many requests"), req.requestId);

// General API rate limiter. Uses in-memory store — fine for a single instance;
// a multi-instance deployment needs a shared store (e.g. Redis).
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const max = Number(process.env.RATE_LIMIT_MAX) || 100;

export const rateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests,
});

// Stricter limiter for login — caps brute-force attempts independent of the
// general API limit.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests,
});
