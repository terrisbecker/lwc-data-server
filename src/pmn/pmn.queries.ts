import { prisma } from "../db";
import type { pmn_combined_field_data } from "../../generated/prisma/client";

/**
 * Fetch every row from the pmn_combined_field_data table.
 */
export async function getAllCombinedFieldData(): Promise<pmn_combined_field_data[]> {
  return prisma.pmn_combined_field_data.findMany();
}
