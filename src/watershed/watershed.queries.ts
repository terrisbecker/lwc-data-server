import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";
import type { phosphate_data } from "../../generated/prisma/client";

// Row shape returned by the list query: phosphate_data with its joined location.
export type PhosphateDataWithLocation = Prisma.phosphate_dataGetPayload<{
  include: { locations: true };
}>;

export async function findLocationById(loc_id: string): Promise<{ loc_id: string } | null> {
  return prisma.locations.findUnique({ where: { loc_id }, select: { loc_id: true } });
}

export async function getAllPhosphateData(): Promise<PhosphateDataWithLocation[]> {
  return prisma.phosphate_data.findMany({ include: { locations: true } });
}

export async function createPhosphateData(
  data: Prisma.phosphate_dataCreateInput,
): Promise<phosphate_data> {
  return prisma.phosphate_data.create({ data });
}

export async function updatePhosphateDataById(
  id: string,
  data: Prisma.phosphate_dataUpdateInput,
): Promise<phosphate_data | null> {
  try {
    return await prisma.phosphate_data.update({ where: { id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return null;
    }
    throw e;
  }
}

export async function deletePhosphateDataById(
  id: string,
): Promise<phosphate_data | null> {
  try {
    return await prisma.phosphate_data.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return null;
    }
    throw e;
  }
}
