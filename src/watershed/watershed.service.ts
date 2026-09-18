import {
  findLocationById,
  getAllPhosphateData,
  createPhosphateData,
  updatePhosphateDataById,
  deletePhosphateDataById,
  type PhosphateDataWithLocation,
} from "./watershed.queries";
import { Prisma } from "../../generated/prisma/client";
import type { phosphate_data } from "../../generated/prisma/client";
import { InternalError, BadRequestError } from "../http/api.error";
import { ErrorCodes, type ErrorCode } from "../http/error.codes";

// `message` names the failed operation for the log; the client sees publicMessage.
export class WatershedServiceError extends InternalError {
  constructor(
    message: string,
    cause?: unknown,
    code: ErrorCode = ErrorCodes.PHOSPHATE_READ_FAILED,
    publicMessage = "The request could not be completed.",
  ) {
    super(message, { code, publicMessage, cause });
    this.name = "WatershedServiceError";
  }
}

/**
 * Client input problems — the message is safe to return in a 400 response.
 * Watershed previously had no client-error class, so a bad `loc_id` surfaced as a
 * 500 (the Prisma `connect` blew up inside the service wrapper).
 */
export class WatershedValidationError extends BadRequestError {
  constructor(message: string, code: ErrorCode = ErrorCodes.INVALID_FIELD, details?: unknown) {
    super(message, { code, details });
    this.name = "WatershedValidationError";
  }
}

/**
 * `locations` is a public reference table, so confirming that an id is unknown
 * leaks nothing. This is a 400 rather than a 404 because the offending id is in
 * the request body — a 404 would read as "no such endpoint".
 */
async function assertLocationExists(loc_id: string): Promise<void> {
  let location;
  try {
    location = await findLocationById(loc_id);
  } catch (cause) {
    throw new WatershedServiceError(
      "Failed to look up sampling location",
      cause,
      ErrorCodes.PHOSPHATE_READ_FAILED,
      "The sampling location could not be verified.",
    );
  }
  if (!location) {
    throw new WatershedValidationError(
      "No sampling location matches the loc_id provided.",
      ErrorCodes.PHOSPHATE_LOCATION_UNKNOWN,
      { field: "loc_id", received: loc_id },
    );
  }
}

/**
 * Maps the Prisma failures a `locations.connect` can raise onto a client error.
 * Belt-and-braces behind assertLocationExists, which covers the common case
 * without a round trip through an opaque 500.
 */
function mapConnectFailure(cause: unknown): never {
  if (
    cause instanceof Prisma.PrismaClientKnownRequestError &&
    (cause.code === "P2025" || cause.code === "P2003")
  ) {
    throw new WatershedValidationError(
      "No sampling location matches the loc_id provided.",
      ErrorCodes.PHOSPHATE_LOCATION_UNKNOWN,
      { field: "loc_id" },
    );
  }
  throw cause;
}

export async function getPhosphateData(): Promise<PhosphateDataWithLocation[]> {
  try {
    return await getAllPhosphateData();
  } catch (cause) {
    throw new WatershedServiceError(
      "Failed to fetch phosphate data",
      cause,
      ErrorCodes.PHOSPHATE_READ_FAILED,
      "Phosphate data could not be retrieved.",
    );
  }
}

export async function createRecord(
  data: Prisma.phosphate_dataCreateInput,
  loc_id: string,
): Promise<phosphate_data> {
  await assertLocationExists(loc_id);

  try {
    return await createPhosphateData(data);
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError) mapConnectFailure(cause);
    throw new WatershedServiceError(
      "Failed to create phosphate data record",
      cause,
      ErrorCodes.PHOSPHATE_CREATE_FAILED,
      "The request could not be completed while saving the phosphate record.",
    );
  }
}

export async function updateRecord(
  id: string,
  data: Prisma.phosphate_dataUpdateInput,
  loc_id?: string,
): Promise<phosphate_data | null> {
  if (loc_id !== undefined) await assertLocationExists(loc_id);

  try {
    return await updatePhosphateDataById(id, data);
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError) mapConnectFailure(cause);
    throw new WatershedServiceError(
      "Failed to update phosphate data record",
      cause,
      ErrorCodes.PHOSPHATE_UPDATE_FAILED,
      "The request could not be completed while updating the phosphate record.",
    );
  }
}

export async function deleteRecord(id: string): Promise<phosphate_data | null> {
  try {
    return await deletePhosphateDataById(id);
  } catch (cause) {
    throw new WatershedServiceError(
      "Failed to delete phosphate data record",
      cause,
      ErrorCodes.PHOSPHATE_DELETE_FAILED,
      "The request could not be completed while deleting the phosphate record.",
    );
  }
}
