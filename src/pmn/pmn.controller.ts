import type { Request, Response, NextFunction } from "express";
import { getCombinedFieldData, createRecord, updateRecord, deleteRecord } from "./pmn.service";
import { Prisma } from "../../generated/prisma/client";

export async function handleGetCombinedFieldData(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getCombinedFieldData();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function handleCreateCombinedFieldData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await createRecord(req.body as Prisma.pmn_combined_field_dataCreateInput);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateCombinedFieldData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const record = await updateRecord(
      req.params.id as string,
      req.body as Prisma.pmn_combined_field_dataUpdateInput,
    );
    if (record === null) {
      res.status(404).json({ error: { message: "Record not found" } });
      return;
    }
    res.json({ data: record });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteCombinedFieldData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const record = await deleteRecord(req.params.id as string);
    if (record === null) {
      res.status(404).json({ error: { message: "Record not found" } });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
