import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { ApiError, BadRequestError, ApiErrorOptions } from "../http/api.error";
import { ErrorCodes, type ErrorCode } from "../http/error.codes";
import { fail } from "../http/respond";
import { logError } from "../http/log";

/**
 * Body-parser failures. `express.json()` throws http-errors objects carrying a
 * `type` discriminator; these are client mistakes, not server faults, and used to
 * surface as 500s.
 *
 * `err.message` is never echoed here — it can quote a fragment of the raw body.
 */
const BODY_PARSER_ERRORS: Record<string, { status: number; code: ErrorCode; message: string }> = {
  "entity.parse.failed": {
    status: 400,
    code: ErrorCodes.MALFORMED_JSON,
    message: "The request body is not valid JSON.",
  },
  "entity.too.large": {
    status: 413,
    code: ErrorCodes.PAYLOAD_TOO_LARGE,
    message: "The request body is larger than the 1MB limit.",
  },
  "encoding.unsupported": {
    status: 415,
    code: ErrorCodes.UNSUPPORTED_MEDIA_TYPE,
    message: "The request body encoding is not supported.",
  },
  "request.aborted": {
    status: 400,
    code: ErrorCodes.MALFORMED_JSON,
    message: "The request body was not fully received.",
  },
};

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  const type = (err as { type?: unknown } | null)?.type;
  if (typeof type === "string" && BODY_PARSER_ERRORS[type]) {
    const mapped = BODY_PARSER_ERRORS[type]!;
    const options: ApiErrorOptions = {
      status: mapped.status,
      code: mapped.code,
      publicMessage: mapped.message,
      cause: err,
    };
    return new ApiError(mapped.message, options);
  }

  // Any other http-errors-shaped 4xx thrown by middleware we don't own.
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return new BadRequestError("The request was not valid.", {
      status,
      code: ErrorCodes.INVALID_FIELD,
      cause: err,
    } as ApiErrorOptions);
  }

  return new ApiError("Unhandled error", {
    status: 500,
    code: ErrorCodes.INTERNAL_ERROR,
    cause: err,
  });
}

/**
 * Central error middleware — registered last in src/index.ts.
 *
 * Maps any thrown value to a status/code/client-message, logs one structured line
 * keyed by requestId (including a redacted summary of the `.cause` chain), and
 * responds with the standard error envelope. Internal wording, stack traces and
 * DB detail stay server-side.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  // Defensive fallback in case the requestId middleware is ever unmounted.
  const requestId = req.requestId ?? randomUUID();
  const apiError = toApiError(err);

  logError(
    {
      requestId,
      method: req.method,
      path: req.originalUrl,
      userId: req.user?.id,
      status: apiError.status,
      code: apiError.code,
    },
    apiError,
  );

  fail(res, apiError, requestId);
}
