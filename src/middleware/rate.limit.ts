import rateLimit from "express-rate-limit";

/**
 * Per-IP rate limiter for the API. Uses the default in-memory store, which is
 * fine for a single instance; a multi-instance deployment would need a shared
 * store (e.g. Redis) so limits are enforced across processes.
 *
 * Window and max are overridable via `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`.
 */
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const max = Number(process.env.RATE_LIMIT_MAX) || 100;

export const rateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { message: "Too many requests" } });
  },
});
