import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";
import type { upload } from "../../generated/prisma/client";

export async function createUploadRecords(
  records: Prisma.uploadUncheckedCreateInput[],
): Promise<upload[]> {
  return prisma.$transaction(records.map((data) => prisma.upload.create({ data })));
}

export async function confirmUploadRecords(ids: string[], userId: string): Promise<number> {
  const result = await prisma.upload.updateMany({
    where: { id: { in: ids }, user_id: userId, status: "pending" },
    data: { status: "confirmed" },
  });
  return result.count;
}

export async function findUploadById(id: string): Promise<upload | null> {
  return prisma.upload.findUnique({ where: { id } });
}

export async function findConfirmedUploadsByIds(
  ids: string[],
): Promise<Pick<upload, "id" | "content_type">[]> {
  return prisma.upload.findMany({
    where: { id: { in: ids }, status: "confirmed" },
    select: { id: true, content_type: true },
  });
}

export async function findUploadsByUser(userId: string): Promise<upload[]> {
  return prisma.upload.findMany({
    where: { user_id: userId, status: "confirmed" },
    orderBy: { created_at: "desc" },
  });
}
