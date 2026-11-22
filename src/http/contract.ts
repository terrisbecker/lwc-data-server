import type { components, paths } from "../types/openapi";

/**
 * Type helpers over the types generated from openapi.yaml (`npm run openapi:types`).
 * Controllers type `req.body` from the contract instead of an inline cast, so a
 * spec change that breaks a handler shows up at compile time.
 *
 * The request validator has already checked the body against the same schema by
 * the time a handler runs, so these types describe what actually arrives.
 */

/** A named schema from `components.schemas`, e.g. `Schema<"User">`. */
export type Schema<N extends keyof components["schemas"]> = components["schemas"][N];

type Method = "get" | "post" | "patch" | "delete";

/** The JSON request body of an operation, e.g. `RequestBody<"/api/users", "post">`. */
export type RequestBody<P extends keyof paths, M extends Method> = paths[P][M] extends {
  requestBody?: { content: { "application/json": infer B } };
}
  ? B
  : never;
