import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";
import type { pmn_combined_field_data } from "../../generated/prisma/client";

export async function getAllCombinedFieldData(
  hasScum?: boolean,
): Promise<pmn_combined_field_data[]> {
  return prisma.pmn_combined_field_data.findMany({
    where: hasScum === undefined ? undefined : { has_scum: hasScum },
  });
}

export async function findCombinedFieldDataById(
  id: string,
): Promise<pmn_combined_field_data | null> {
  return prisma.pmn_combined_field_data.findUnique({ where: { id } });
}

// True if any PMN record lists this upload as a scum photo — the gate for public access.
export async function isReferencedAsScumPhoto(uploadId: string): Promise<boolean> {
  const row = await prisma.pmn_combined_field_data.findFirst({
    where: { scum_photos: { has: uploadId } },
    select: { id: true },
  });
  return row !== null;
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
