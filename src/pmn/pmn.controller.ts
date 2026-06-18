import type { Request, Response, NextFunction } from "express";
import { getCombinedFieldData } from "./pmn.service";

/**
 * GET handler returning all PMN combined field data.
 *
 * Delegates data access to the service layer. Any failure is forwarded to
 * Express's error-handling middleware via `next` rather than handled inline.
 */
export async function handleGetCombinedFieldData(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getCombinedFieldData();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
