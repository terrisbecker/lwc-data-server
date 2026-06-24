import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";
import type { pmn_combined_field_data } from "../../generated/prisma/client";

export async function getAllCombinedFieldData(): Promise<pmn_combined_field_data[]> {
  return prisma.pmn_combined_field_data.findMany();
}

export async function createCombinedFieldData(
  data: Prisma.pmn_combined_field_dataCreateInput,
): Promise<pmn_combined_field_data> {
  return prisma.pmn_combined_field_data.create({ data });
}

export async function updateCombinedFieldDataById(
  id: string,
  data: Prisma.pmn_combined_field_dataUpdateInput,
): Promise<pmn_combined_field_data | null> {
  try {
    return await prisma.pmn_combined_field_data.update({ where: { id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return null;
    }
    throw e;
  }
}

export async function deleteCombinedFieldDataById(
  id: string,
): Promise<pmn_combined_field_data | null> {
  try {
    return await prisma.pmn_combined_field_data.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return null;
    }
    throw e;
  }
}
