import * as OpenApiValidator from "express-openapi-validator";
import { ApiError, BadRequestError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";
import { SPEC_PATH } from "./spec";

/**
 * Request validation against openapi.yaml. Add `validate` to a route **after**
 * `requireRole`, so auth failures (401/403) still win over a bad body (400):
 *
 *   pmnRouter.post("/combined-field-data", requireRole("volunteer"), validate, handler);
 *
 * Paths are matched on `req.originalUrl`, so one shared instance works on every
 * router regardless of its mount prefix.
 */
export const validate = OpenApiValidator.middleware({
  apiSpec: SPEC_PATH,
  validateRequests: {
    // Leave query strings as strings: `optionalBooleanQuery` expects "true"/"false".
    coerceTypes: false,
    // Unknown query params (cache-busters like `?_=123`) are ignored, not rejected.
    allowUnknownQueryParameters: true,
    removeAdditional: false,
  },
  validateResponses: false,
  // Auth stays with jwtAuth / requireRole; the spec only documents it.
  validateSecurity: false,
  // Anything not in the spec falls through to the route or notFoundHandler.
  ignoreUndocumented: true,
});

const { BadRequest, UnsupportedMediaType, RequestEntityTooLarge } = OpenApiValidator.error;

interface ValidatorIssue {
  path?: string;
  message?: string;
  errorCode?: string;
}

interface Issue {
  /** "body", "params", "query", "headers" — the first path segment. */
  location: string;
  /** Dotted field path inside that location, e.g. `files.0.sizeBytes`. */
  field: string;
  keyword: string;
  message: string;
}

function toIssue(raw: ValidatorIssue): Issue {
  // Paths look like "/body/files/0/sizeBytes" or "/params/id".
  const [location = "body", ...rest] = (raw.path ?? "").replace(/^\//, "").split("/");
  return {
    location,
    field: rest.join(".") || location,
    keyword: (raw.errorCode ?? "").split(".")[0] ?? "",
    message: raw.message ?? "is not valid",
  };
}

/**
 * Maps a validator error into the standard envelope, keeping the codes the
 * hand-written checks already return:
 *   - a UUID-format failure          → INVALID_ID   (path params: "Invalid id", as requireUuidParam)
 *   - a missing top-level body field → MISSING_FIELD
 *   - anything else                  → INVALID_FIELD
 * Messages come from Ajv and name only the field and the expectation — never DB
 * internals. Returns undefined for anything that isn't a validator error.
 */
export function fromValidatorError(err: unknown): ApiError | undefined {
  if (err instanceof UnsupportedMediaType) {
    return new ApiError("Request media type rejected by contract", {
      status: 415,
      code: ErrorCodes.UNSUPPORTED_MEDIA_TYPE,
      publicMessage: "The request body must be application/json.",
      cause: err,
    });
  }
  if (err instanceof RequestEntityTooLarge) {
    return new ApiError("Request body rejected by contract as too large", {
      status: 413,
      code: ErrorCodes.PAYLOAD_TOO_LARGE,
      publicMessage: "The request body is larger than the 1MB limit.",
      cause: err,
    });
  }
  if (!(err instanceof BadRequest)) return undefined;

  const issues = ((err as { errors?: ValidatorIssue[] }).errors ?? []).map(toIssue);
  const errors = issues.map(({ location, field, message }) => ({
    field: location === "body" ? field : `${location}.${field}`,
    message,
  }));

  const uuid = issues.find((i) => i.keyword === "format" && i.message.includes('"uuid"'));
  if (uuid?.location === "params") {
    return new BadRequestError("Invalid id", {
      code: ErrorCodes.INVALID_ID,
      details: { field: uuid.field, expected: "UUID" },
      cause: err,
    });
  }
  if (uuid) {
    return new BadRequestError(`${uuid.field} must be a UUID`, {
      code: ErrorCodes.INVALID_ID,
      details: { field: uuid.field, expected: "UUID", errors },
      cause: err,
    });
  }

  const missing = issues.find(
    (i) => i.keyword === "required" && i.location === "body" && !i.field.includes("."),
  );
  if (missing) {
    return new BadRequestError(`${missing.field} is required`, {
      code: ErrorCodes.MISSING_FIELD,
      details: { field: missing.field, errors },
      cause: err,
    });
  }

  const first = issues[0];
  const message = !first
    ? "The request does not match the API contract."
    : first.keyword === "additionalProperties"
      ? `${first.field} is not an allowed field`
      : `${first.field} ${first.message}`;
  return new BadRequestError(message, {
    code: ErrorCodes.INVALID_FIELD,
    details: { field: first?.field, errors },
    cause: err,
  });
}
