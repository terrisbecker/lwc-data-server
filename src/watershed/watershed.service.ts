import {
  getAllPhosphateData,
  createPhosphateData,
  updatePhosphateDataById,
  deletePhosphateDataById,
  type PhosphateDataWithLocation,
} from "./watershed.queries";
import { Prisma } from "../../generated/prisma/client";
import type { phosphate_data } from "../../generated/prisma/client";

export class WatershedServiceError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "WatershedServiceError";
    this.cause = cause;
  }
}

export async function getPhosphateData(): Promise<PhosphateDataWithLocation[]> {
  try {
    return await getAllPhosphateData();
  } catch (cause) {
    throw new WatershedServiceError("Failed to fetch phosphate data", cause);
  }
}

export async function createRecord(
  data: Prisma.phosphate_dataCreateInput,
): Promise<phosphate_data> {
  try {
    return await createPhosphateData(data);
  } catch (cause) {
    throw new WatershedServiceError("Failed to create phosphate data record", cause);
  }
}

export async function updateRecord(
  id: string,
  data: Prisma.phosphate_dataUpdateInput,
): Promise<phosphate_data | null> {
  try {
    return await updatePhosphateDataById(id, data);
  } catch (cause) {
    throw new WatershedServiceError("Failed to update phosphate data record", cause);
  }
}

export async function deleteRecord(
  id: string,
): Promise<phosphate_data | null> {
  try {
    return await deletePhosphateDataById(id);
  } catch (cause) {
    throw new WatershedServiceError("Failed to delete phosphate data record", cause);
  }
}
