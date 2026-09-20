import { ErrorCodes } from "./error.codes";
import { BadRequestError } from "./api.error";

/**
 * Single home for the UUID pattern, which was previously copy-pasted into five
 * controllers and pmn.service.ts.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * These helpers throw rather than write a response. Every controller handler is
 * `async`, and Express 5 forwards a rejected handler promise to the error
 * middleware automatically, so a throw from anywhere in a handler — including
 * outside the existing try blocks — lands in errorHandler and gets the standard
 * envelope.
 */

/** Path/route parameter that must be a UUID. */
export function requireUuidParam(value: unknown, field = "id"): string {
  if (!isUuid(value)) {
    throw new BadRequestError("Invalid id", {
      code: ErrorCodes.INVALID_ID,
      details: { field, expected: "UUID" },
    });
  }
  return value;
}

/** Body field that must be a present, non-empty string. */
export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BadRequestError(`${field} is required`, {
      code: ErrorCodes.MISSING_FIELD,
      details: { field, expected: "non-empty string" },
    });
  }
  return value;
}

/** Body field that must be a UUID when present. */
export function requireUuidField(value: unknown, field: string): string {
  if (!isUuid(value)) {
    throw new BadRequestError(`${field} must be a UUID`, {
      code: ErrorCodes.INVALID_ID,
      details: { field, expected: "UUID" },
    });
  }
  return value;
}

/** Optional `?flag=true|false` query parameter. */
export function optionalBooleanQuery(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false") {
    throw new BadRequestError(`${field} must be true or false`, {
      code: ErrorCodes.INVALID_FIELD,
      details: { field, expected: ["true", "false"], received: value },
    });
  }
  return value === "true";
}

export function requireOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new BadRequestError(`${field} must be one of: ${allowed.join(", ")}`, {
      code: ErrorCodes.INVALID_FIELD,
      details: { field, expected: allowed },
    });
  }
  return value as T;
}

/** Array field with optional min/max bounds; `message` overrides the default wording. */
export function requireArray<T = unknown>(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; message?: string; maxMessage?: string } = {},
): T[] {
  const { min = 1, max, message, maxMessage } = opts;

  if (!Array.isArray(value) || value.length < min) {
    throw new BadRequestError(message ?? `${field} must be a non-empty array`, {
      code: ErrorCodes.INVALID_FIELD,
      details: { field, expected: `array with at least ${min} item(s)` },
    });
  }
  if (max !== undefined && value.length > max) {
    throw new BadRequestError(maxMessage ?? `Maximum ${max} ${field} per request`, {
      code: ErrorCodes.INVALID_FIELD,
      details: { field, max, received: value.length },
    });
  }
  return value as T[];
}

/** Array whose every element must be a UUID. */
export function requireUuidArray(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; message?: string; maxMessage?: string; itemMessage?: string } = {},
): string[] {
  const items = requireArray<unknown>(value, field, opts);
  if (items.some((id) => !isUuid(id))) {
    throw new BadRequestError(opts.itemMessage ?? `All ${field} must be valid UUIDs`, {
      code: ErrorCodes.INVALID_ID,
      details: { field, expected: "array of UUIDs" },
    });
  }
  return items as string[];
}
