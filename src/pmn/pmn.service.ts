import {
  getAllCombinedFieldData,
  findCombinedFieldDataById,
  isReferencedAsScumPhoto,
  createCombinedFieldData,
  updateCombinedFieldDataById,
  deleteCombinedFieldDataById,
} from "./pmn.queries";
import { findConfirmedUploadsByIds } from "../uploads/uploads.queries";
import { getPresignedGetUrl, MAX_FILES, type PresignedGetResult } from "../uploads/uploads.service";
import { Prisma } from "../../generated/prisma/client";
import type { pmn_combined_field_data } from "../../generated/prisma/client";
import { InternalError, BadRequestError } from "../http/api.error";
import { ErrorCodes, type ErrorCode } from "../http/error.codes";
import { isUuid } from "../http/validate";

// `message` names the failed operation for the log; the client sees publicMessage.
export class PmnServiceError extends InternalError {
  constructor(
    message: string,
    cause?: unknown,
    code: ErrorCode = ErrorCodes.PMN_READ_FAILED,
    publicMessage = "The request could not be completed.",
  ) {
    super(message, { code, publicMessage, cause });
    this.name = "PmnServiceError";
  }
}

// Client input problems — the message is safe to return in a 400 response.
export class PmnValidationError extends BadRequestError {
  constructor(message: string, details?: unknown) {
    super(message, { code: ErrorCodes.PMN_SCUM_RULE_VIOLATION, details });
    this.name = "PmnValidationError";
  }
}

interface ScumFields {
  has_scum?: unknown;
  scum_photos?: unknown;
  photos?: unknown;
}

// Enforces scum invariants on the effective (post-merge) record and returns the
// has_scum value to persist. Scum photos become publicly viewable, so every id
// must be a confirmed image upload.
async function validateScum(merged: ScumFields, hasScumProvided: boolean): Promise<boolean | undefined> {
  const { scum_photos, photos } = merged;
  let hasScum = merged.has_scum;

  if (hasScum !== undefined && typeof hasScum !== "boolean") {
    throw new PmnValidationError("has_scum must be a boolean", { field: "has_scum" });
  }
  if (scum_photos === undefined) return hasScum as boolean | undefined;

  if (!Array.isArray(scum_photos) || scum_photos.some((id) => !isUuid(id))) {
    throw new PmnValidationError("scum_photos must be an array of upload UUIDs", {
      field: "scum_photos",
      expected: "array of upload UUIDs",
    });
  }
  if (scum_photos.length > MAX_FILES) {
    throw new PmnValidationError(`Maximum ${MAX_FILES} scum photos per record`, {
      field: "scum_photos",
      max: MAX_FILES,
      received: scum_photos.length,
    });
  }
  if (scum_photos.length === 0) return hasScum as boolean | undefined;

  if (hasScum === false) {
    throw new PmnValidationError(
      hasScumProvided
        ? "has_scum cannot be false when scum_photos is non-empty"
        : "Record has scum photos; clear scum_photos to set has_scum to false",
      { field: "has_scum" },
    );
  }
  hasScum = true;

  if (Array.isArray(photos) && photos.some((id) => scum_photos.includes(id))) {
    throw new PmnValidationError("An upload cannot appear in both photos and scum_photos", {
      field: "scum_photos",
    });
  }

  const unique = [...new Set(scum_photos as string[])];
  let uploads;
  try {
    uploads = await findConfirmedUploadsByIds(unique);
  } catch (cause) {
    throw new PmnServiceError(
      "Failed to look up scum photo uploads",
      cause,
      ErrorCodes.PMN_SCUM_LOOKUP_FAILED,
      "Scum photos could not be verified while saving the record.",
    );
  }
  const valid = new Set(uploads.filter((u) => u.content_type.startsWith("image/")).map((u) => u.id));
  if (unique.some((id) => !valid.has(id))) {
    throw new PmnValidationError("Every scum photo must be a confirmed image upload", {
      field: "scum_photos",
    });
  }

  return true;
}

export async function getCombinedFieldData(hasScum?: boolean): Promise<pmn_combined_field_data[]> {
  try {
    return await getAllCombinedFieldData(hasScum);
  } catch (cause) {
    throw new PmnServiceError(
      "Failed to fetch PMN combined field data",
      cause,
      ErrorCodes.PMN_READ_FAILED,
      "PMN field data could not be retrieved.",
    );
  }
}

export async function createRecord(
  data: Prisma.pmn_combined_field_dataCreateInput,
): Promise<pmn_combined_field_data> {
  const hasScum = await validateScum(data, data.has_scum !== undefined);
  try {
    return await createCombinedFieldData(hasScum === undefined ? data : { ...data, has_scum: hasScum });
  } catch (cause) {
    throw new PmnServiceError(
      "Failed to create PMN record",
      cause,
      ErrorCodes.PMN_CREATE_FAILED,
      "The request could not be completed while saving the PMN record.",
    );
  }
}

export async function updateRecord(
  id: string,
  data: Prisma.pmn_combined_field_dataUpdateInput,
): Promise<pmn_combined_field_data | null> {
  let existing;
  try {
    existing = await findCombinedFieldDataById(id);
  } catch (cause) {
    throw new PmnServiceError(
      "Failed to update PMN record",
      cause,
      ErrorCodes.PMN_UPDATE_FAILED,
      "The request could not be completed while updating the PMN record.",
    );
  }
  if (!existing) return null;

  const hasScum = await validateScum({ ...existing, ...data }, data.has_scum !== undefined);
  const payload = hasScum === undefined ? data : { ...data, has_scum: hasScum };

  try {
    return await updateCombinedFieldDataById(id, payload);
  } catch (cause) {
    throw new PmnServiceError(
      "Failed to update PMN record",
      cause,
      ErrorCodes.PMN_UPDATE_FAILED,
      "The request could not be completed while updating the PMN record.",
    );
  }
}

export async function deleteRecord(
  id: string,
): Promise<pmn_combined_field_data | null> {
  try {
    return await deleteCombinedFieldDataById(id);
  } catch (cause) {
    throw new PmnServiceError(
      "Failed to delete PMN record",
      cause,
      ErrorCodes.PMN_DELETE_FAILED,
      "The request could not be completed while deleting the PMN record.",
    );
  }
}

// Public access to an upload, granted only while some PMN record lists it as a
// scum photo. Unknown and non-scum uploads both return null (404) so this
// endpoint doesn't reveal which upload ids exist.
export async function getPublicScumPhotoUrl(uploadId: string): Promise<PresignedGetResult | null> {
  let referenced;
  try {
    referenced = await isReferencedAsScumPhoto(uploadId);
  } catch (cause) {
    throw new PmnServiceError(
      "Failed to look up scum photo",
      cause,
      ErrorCodes.PMN_SCUM_LOOKUP_FAILED,
      "The scum photo could not be looked up.",
    );
  }
  if (!referenced) return null;
  return getPresignedGetUrl(uploadId);
}
