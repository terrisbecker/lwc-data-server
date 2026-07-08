import type { Request, Response, NextFunction } from "express";
import { getPhosphateData, createRecord, updateRecord, deleteRecord } from "./watershed.service";
import { Prisma } from "../../generated/prisma/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleGetPhosphateData(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getPhosphateData();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function handleCreatePhosphateData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Strip `id` — the DB assigns the UUID; accepting a client-supplied id would
    // allow callers to force a specific primary key. Clients send a flat `loc_id`,
    // which we map to the nested relation Prisma expects.
    const { id: _id, loc_id, ...rest } = req.body as Record<string, unknown>;
    const data = {
      ...rest,
      locations: { connect: { loc_id: loc_id as string } },
    } as Prisma.phosphate_dataCreateInput;
    const record = await createRecord(data);
    res.status(201).json({ data: record });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdatePhosphateData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!UUID_RE.test(req.params.id as string)) {
    res.status(400).json({ error: { message: "Invalid id" } });
    return;
  }

  try {
    // A bare `loc_id` scalar isn't valid on the update input — map it to the nested
    // relation when present; leave the rest of the body untouched.
    const { loc_id, ...rest } = req.body as Record<string, unknown>;
    const data = {
      ...rest,
      ...(loc_id !== undefined
        ? { locations: { connect: { loc_id: loc_id as string } } }
        : {}),
    } as Prisma.phosphate_dataUpdateInput;
    const record = await updateRecord(req.params.id as string, data);
    if (record === null) {
      res.status(404).json({ error: { message: "Record not found" } });
      return;
    }
    res.json({ data: record });
  } catch (err) {
    next(err);
  }
}

export async function handleDeletePhosphateData(
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
