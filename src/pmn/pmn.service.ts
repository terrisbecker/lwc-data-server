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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PmnServiceError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PmnServiceError";
    this.cause = cause;
  }
}

// Client input problems — the message is safe to return in a 400 response.
export class PmnValidationError extends Error {
  constructor(message: string) {
    super(message);
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
    throw new PmnValidationError("has_scum must be a boolean");
  }
  if (scum_photos === undefined) return hasScum as boolean | undefined;

  if (!Array.isArray(scum_photos) || scum_photos.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
    throw new PmnValidationError("scum_photos must be an array of upload UUIDs");
  }
  if (scum_photos.length > MAX_FILES) {
    throw new PmnValidationError(`Maximum ${MAX_FILES} scum photos per record`);
  }
  if (scum_photos.length === 0) return hasScum as boolean | undefined;

  if (hasScum === false) {
    throw new PmnValidationError(
      hasScumProvided
        ? "has_scum cannot be false when scum_photos is non-empty"
        : "Record has scum photos; clear scum_photos to set has_scum to false",
    );
  }
  hasScum = true;

  if (Array.isArray(photos) && photos.some((id) => scum_photos.includes(id))) {
    throw new PmnValidationError("An upload cannot appear in both photos and scum_photos");
  }

  const unique = [...new Set(scum_photos as string[])];
  let uploads;
  try {
    uploads = await findConfirmedUploadsByIds(unique);
  } catch (cause) {
    throw new PmnServiceError("Failed to look up scum photo uploads", cause);
  }
  const valid = new Set(uploads.filter((u) => u.content_type.startsWith("image/")).map((u) => u.id));
  if (unique.some((id) => !valid.has(id))) {
    throw new PmnValidationError("Every scum photo must be a confirmed image upload");
  }

  return true;
}

export async function getCombinedFieldData(hasScum?: boolean): Promise<pmn_combined_field_data[]> {
  try {
    return await getAllCombinedFieldData(hasScum);
  } catch (cause) {
    throw new PmnServiceError("Failed to fetch PMN combined field data", cause);
  }
}

export async function createRecord(
  data: Prisma.pmn_combined_field_dataCreateInput,
): Promise<pmn_combined_field_data> {
  const hasScum = await validateScum(data, data.has_scum !== undefined);
  try {
    return await createCombinedFieldData(hasScum === undefined ? data : { ...data, has_scum: hasScum });
  } catch (cause) {
    throw new PmnServiceError("Failed to create PMN record", cause);
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
    throw new PmnServiceError("Failed to update PMN record", cause);
  }
  if (!existing) return null;

  const hasScum = await validateScum({ ...existing, ...data }, data.has_scum !== undefined);
  const payload = hasScum === undefined ? data : { ...data, has_scum: hasScum };

  try {
    return await updateCombinedFieldDataById(id, payload);
  } catch (cause) {
    throw new PmnServiceError("Failed to update PMN record", cause);
  }
}

export async function deleteRecord(
  id: string,
): Promise<pmn_combined_field_data | null> {
  try {
    return await deleteCombinedFieldDataById(id);
  } catch (cause) {
    throw new PmnServiceError("Failed to delete PMN record", cause);
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
    throw new PmnServiceError("Failed to look up scum photo", cause);
  }
  if (!referenced) return null;
  return getPresignedGetUrl(uploadId);
}
