import { ErrorCodes, type ErrorCode } from "./error.codes";

export interface ApiErrorOptions {
  /** HTTP status to respond with. Defaults to 500. */
  status?: number;
  /** Machine-readable code returned as `error.code`. Defaults to INTERNAL_ERROR. */
  code?: ErrorCode;
  /**
   * The message the *client* sees. Defaults to a generic, status-appropriate
   * string. For 5xx this deliberately differs from `message`, which stays
   * internal.
   */
  publicMessage?: string;
  /** Extra client-safe context (field names, counts). Never DB internals. */
  details?: unknown;
  /** The original error, for the server log only. */
  cause?: unknown;
}

const GENERIC_BY_STATUS: Record<number, string> = {
  400: "The request was not valid.",
  401: "Unauthorized",
  403: "Forbidden",
  404: "The requested resource was not found.",
  409: "The request conflicts with the current state of the resource.",
  413: "The request body is too large.",
  415: "The request media type is not supported.",
  429: "Too many requests",
};

const GENERIC_SERVER_MESSAGE =
  "The request could not be completed. Quote the requestId when reporting this.";

/**
 * Base class for every error that maps to an HTTP response.
 *
 * The key split is `message` vs `publicMessage`:
 *   - `message` is the internal description — it goes to the server log and may
 *     name the operation that failed ("Failed to create PMN record").
 *   - `publicMessage` is what reaches the client. For 4xx the two are usually the
 *     same; for 5xx they must not be.
 *
 * `cause` is assigned as a plain property rather than passed via
 * `super(message, { cause })` — tsconfig targets ES2020 (tsconfig.json), which
 * predates that constructor option.
 *
 * Note: ES2020 emits native classes, so `instanceof` works across this hierarchy
 * without the `Object.setPrototypeOf(this, new.target.prototype)` workaround. That
 * workaround becomes mandatory if the target is ever lowered to ES5.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly publicMessage: string;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.status = options.status ?? 500;
    this.code = options.code ?? ErrorCodes.INTERNAL_ERROR;
    this.publicMessage =
      options.publicMessage ??
      (this.status >= 500
        ? GENERIC_SERVER_MESSAGE
        : (GENERIC_BY_STATUS[this.status] ?? "The request was not valid."));
    this.details = options.details;
    this.cause = options.cause;
  }
}

/** 400 — the client sent something we can describe back to them safely. */
export class BadRequestError extends ApiError {
  constructor(publicMessage: string, options: ApiErrorOptions = {}) {
    super(publicMessage, {
      ...options,
      status: 400,
      code: options.code ?? ErrorCodes.INVALID_FIELD,
      publicMessage,
    });
  }
}

export class UnauthorizedError extends ApiError {
  constructor(publicMessage = "Unauthorized", options: ApiErrorOptions = {}) {
    super(publicMessage, {
      ...options,
      status: 401,
      code: options.code ?? ErrorCodes.UNAUTHORIZED,
      publicMessage,
    });
  }
}

export class ForbiddenError extends ApiError {
  constructor(publicMessage = "Forbidden", options: ApiErrorOptions = {}) {
    super(publicMessage, {
      ...options,
      status: 403,
      code: options.code ?? ErrorCodes.FORBIDDEN,
      publicMessage,
    });
  }
}

export class NotFoundError extends ApiError {
  constructor(publicMessage: string, options: ApiErrorOptions = {}) {
    super(publicMessage, {
      ...options,
      status: 404,
      code: options.code ?? ErrorCodes.ROUTE_NOT_FOUND,
      publicMessage,
    });
  }
}

export class ConflictError extends ApiError {
  constructor(publicMessage: string, options: ApiErrorOptions = {}) {
    super(publicMessage, {
      ...options,
      status: 409,
      code: options.code ?? ErrorCodes.INVALID_FIELD,
      publicMessage,
    });
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(publicMessage = "Too many requests", options: ApiErrorOptions = {}) {
    super(publicMessage, {
      ...options,
      status: 429,
      code: options.code ?? ErrorCodes.RATE_LIMITED,
      publicMessage,
    });
  }
}

/**
 * 500 — `message` describes the failed operation for the log; `publicMessage`
 * is the contextual-but-safe text the client gets.
 */
export class InternalError extends ApiError {
  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message, { ...options, status: 500 });
  }
}
