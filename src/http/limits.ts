/**
 * The JSON request-body cap. `express.json()` enforces it (src/index.ts) and both
 * 413 mappings quote it (error.handler.ts, openapi/validator.ts), so the limit and
 * the message can't drift apart.
 */
export const JSON_BODY_LIMIT_BYTES = 1024 * 1024;
export const JSON_BODY_LIMIT_LABEL = `${JSON_BODY_LIMIT_BYTES / (1024 * 1024)}MB`;
