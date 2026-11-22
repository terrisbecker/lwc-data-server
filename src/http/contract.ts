import type { components, paths } from "../types/openapi";

/**
 * Type helpers over the types generated from openapi.yaml (`npm run openapi:types`).
 * Controllers type `req.body` and `req.params` from the contract instead of an
 * inline cast, so a spec change that breaks a handler shows up at compile time.
 *
 * The request validator has already checked the request against the same schema by
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

/**
 * The path parameters of a route, e.g. `PathParams<"/api/users/{id}">` → `{ id: string }`.
 * Express types every param as `string | string[]`; the contract (`format: uuid`)
 * has already narrowed it.
 */
export type PathParams<P extends keyof paths> = paths[P] extends {
  parameters: { path: infer T };
}
  ? T
  : never;
