import { ErrorCodes } from "./error.codes";
import { BadRequestError } from "./api.error";

/**
 * Request shape (types, formats, required fields, enums, bounds) is enforced by
 * the OpenAPI contract before a handler runs (src/openapi/validator.ts), so
 * controllers don't re-check it. What's left here converts already-valid input.
 *
 * Helpers throw rather than write a response: Express 5 forwards a rejected async
 * handler promise to errorHandler, which shapes the envelope.
 */

/**
 * Optional `?flag=true|false` query parameter → boolean. The contract restricts the
 * value to "true"/"false" (with `coerceTypes: false` it stays a string); the throw
 * covers a route whose spec entry doesn't constrain it.
 */
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
