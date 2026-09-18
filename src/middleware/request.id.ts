import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * A client-supplied id is only honored if it looks like an opaque token.
 * Anything else is replaced — an unbounded or newline-bearing header value would
 * otherwise let a caller forge entries in the structured log.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Assigns a correlation id to every request and echoes it as `X-Request-Id`.
 *
 * Mounted first in the chain so that helmet, cors, the rate limiter and the JSON
 * body parser all fail with an id already attached. The header goes out on every
 * response — including 204s and 500s — because a thin 500 body is only
 * actionable if the caller can quote the id back.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const supplied = req.headers["x-request-id"];
  const candidate = Array.isArray(supplied) ? supplied[0] : supplied;

  const id =
    typeof candidate === "string" && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();

  req.requestId = id;
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
