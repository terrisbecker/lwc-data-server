import {
  getAllCombinedFieldData,
  createCombinedFieldData,
  updateCombinedFieldDataById,
  deleteCombinedFieldDataById,
} from "./pmn.queries";
import { Prisma } from "../../generated/prisma/client";
import type { pmn_combined_field_data } from "../../generated/prisma/client";

export class PmnServiceError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PmnServiceError";
    this.cause = cause;
  }
}

export async function getCombinedFieldData(): Promise<pmn_combined_field_data[]> {
  try {
    return await getAllCombinedFieldData();
  } catch (cause) {
    throw new PmnServiceError("Failed to fetch PMN combined field data", cause);
  }
}

export async function createRecord(
  data: Prisma.pmn_combined_field_dataCreateInput,
): Promise<pmn_combined_field_data> {
  try {
    return await createCombinedFieldData(data);
  } catch (cause) {
    throw new PmnServiceError("Failed to create PMN record", cause);
  }
}

export async function updateRecord(
  id: string,
  data: Prisma.pmn_combined_field_dataUpdateInput,
): Promise<pmn_combined_field_data | null> {
  try {
    return await updateCombinedFieldDataById(id, data);
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
