import type { Request, Response, NextFunction } from "express";
import { getCombinedFieldData, createRecord, updateRecord, deleteRecord } from "./pmn.service";
import { Prisma } from "../../generated/prisma/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // Strip `id` — the DB assigns the UUID via gen_random_uuid(); accepting a
    // client-supplied id would allow callers to force a specific primary key.
    const { id: _id, ...safeBody } = req.body as Record<string, unknown>;
    const data = await createRecord(safeBody as Prisma.pmn_combined_field_dataCreateInput);
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
  if (!UUID_RE.test(req.params.id as string)) {
    res.status(400).json({ error: { message: "Invalid id" } });
    return;
  }

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
  if (!UUID_RE.test(req.params.id as string)) {
    res.status(400).json({ error: { message: "Invalid id" } });
    return;
  }

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
