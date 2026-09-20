import "dotenv/config";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { pmnRouter } from "./pmn/pmn.routes";
import { watershedRouter } from "./watershed/watershed.routes";
import { authRouter } from "./auth/auth.routes";
import { usersRouter } from "./users/users.routes";
import { uploadsRouter } from "./uploads/uploads.routes";
import { rateLimiter, loginRateLimiter } from "./middleware/rate.limit";
import { jwtAuth } from "./middleware/jwt.auth";
import { requestId } from "./middleware/request.id";
import { notFoundHandler } from "./middleware/not.found.handler";
import { errorHandler } from "./middleware/error.handler";

const app = express();
const port = Number(process.env.PORT) || 3000;

// Trust the configured number of proxy hops so express-rate-limit sees the real
// client IP behind a load balancer. Defaults to 0 (no proxy) to avoid clients
// spoofing X-Forwarded-For to bypass the rate limiter; set to the hop count in
// the deploy environment (e.g. 1 behind a single ALB).
app.set("trust proxy", Number(process.env.TRUST_PROXY) || 0);

// Correlation id — first in the chain so helmet, cors, the rate limiter and the
// body parser all fail with an id already attached and echoed as X-Request-Id.
app.use(requestId);

// Security headers (X-Content-Type-Options, HSTS, etc.) and X-Powered-By removal.
app.use(helmet());

// CORS allowlist from CORS_ALLOWED_ORIGINS (comma-separated). When unset, no
// cross-origin requests are permitted.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Public health endpoint — intentionally exempt from auth and rate limiting so
// load-balancer probes are never throttled or blocked. Registered before /api.
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Parse JSON request bodies for POST/PATCH endpoints. The limit is pinned so the
// 413 is a deliberate part of the contract rather than an accident of the default.
app.use(express.json({ limit: "1mb" }));

// Auth routes — public, stricter rate limit to cap brute-force attempts.
app.use("/auth", loginRateLimiter, authRouter);

// API routes — rate-limited, then optional JWT extraction. Individual routes
// use requireRole() to enforce access levels beyond guest (unauthenticated GET).
app.use("/api", rateLimiter, jwtAuth);
app.use("/api/pmn", pmnRouter);
app.use("/api/phosphate-data", watershedRouter);
app.use("/api/users", usersRouter);
app.use("/api/uploads", uploadsRouter);

// Unmatched routes — converts Express's default HTML 404 into the JSON envelope.
app.use(notFoundHandler);

// Central error handler — must be registered after all routes.
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
