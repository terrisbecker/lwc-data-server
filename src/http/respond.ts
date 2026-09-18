import type { Response } from "express";
import type { ErrorCode } from "./error.codes";
import type { ApiError } from "./api.error";

export type Meta = Record<string, unknown>;

export interface SuccessEnvelope<T> {
  data: T;
  message?: string;
  meta?: Meta;
}

export interface ErrorEnvelope {
  error: {
    message: string;
    code?: ErrorCode;
    details?: unknown;
    requestId?: string;
  };
}

/**
 * Success helpers.
 *
 * `message` and `meta` are omitted from the JSON entirely when undefined, so the
 * body of an un-annotated response stays byte-identical to the historical bare
 * `{ data }` shape. That is what makes this change additive.
 */
function envelope<T>(data: T, message?: string, meta?: Meta): SuccessEnvelope<T> {
  const body: SuccessEnvelope<T> = { data };
  if (message !== undefined) body.message = message;
  if (meta !== undefined) body.meta = meta;
  return body;
}

export function ok<T>(res: Response, data: T, message?: string, meta?: Meta): void {
  res.status(200).json(envelope(data, message, meta));
}

export function created<T>(res: Response, data: T, message?: string, meta?: Meta): void {
  res.status(201).json(envelope(data, message, meta));
}

/**
 * 204 carries no body by definition, so it takes no message. The X-Request-Id
 * header still goes out. Promoting these to 200 just to carry a message would
 * break existing clients, so we don't.
 */
export function noContent(res: Response): void {
  res.status(204).send();
}

/** 200 with `meta.count` derived from the row count. */
export function list<T>(res: Response, rows: T[], message?: string, meta?: Meta): void {
  ok(res, rows, message, { count: rows.length, ...meta });
}

/**
 * Error responder. Used by errorHandler and by the middleware that responds
 * directly (jwtAuth, requireRole, rateLimiter) so there is exactly one place
 * that shapes an error body.
 */
export function fail(res: Response, err: ApiError, requestId: string): void {
  const body: ErrorEnvelope = {
    error: {
      message: err.publicMessage,
      code: err.code,
      requestId,
    },
  };
  // `details` is client-safe context only, and never set on 5xx.
  if (err.details !== undefined && err.status < 500) {
    body.error.details = err.details;
  }
  res.status(err.status).json(body);
}
