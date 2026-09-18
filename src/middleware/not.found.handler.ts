import type { Request, Response, NextFunction } from "express";
import { NotFoundError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";

/**
 * Terminal handler for unmatched routes, mounted after every router and before
 * errorHandler. Without it Express returns its default HTML 404, which is the one
 * response that escapes the JSON envelope entirely.
 *
 * It delegates via next() rather than responding, so errorHandler stays the only
 * place that shapes an error body.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    new NotFoundError("The requested endpoint does not exist.", {
      code: ErrorCodes.ROUTE_NOT_FOUND,
      details: { method: req.method, path: req.path },
    }),
  );
}
