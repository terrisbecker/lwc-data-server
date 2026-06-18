import { getAllCombinedFieldData } from "./pmn.queries";
import type { pmn_combined_field_data } from "../../generated/prisma/client";

/**
 * Error thrown when the PMN service fails to retrieve data. Wraps the
 * underlying cause so the controller can respond without leaking DB internals.
 */
export class PmnServiceError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PmnServiceError";
    this.cause = cause;
  }
}

/**
 * Retrieve all rows from the PMN combined field data table.
 *
 * @throws {PmnServiceError} if the underlying query fails.
 */
export async function getCombinedFieldData(): Promise<pmn_combined_field_data[]> {
  try {
    return await getAllCombinedFieldData();
  } catch (cause) {
    throw new PmnServiceError("Failed to fetch PMN combined field data", cause);
  }
}
