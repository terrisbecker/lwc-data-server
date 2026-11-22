import type { Request, Response, NextFunction } from "express";
import { getPhosphateData, createRecord, updateRecord, deleteRecord } from "./watershed.service";
import { Prisma } from "../../generated/prisma/client";
import { ok, created, noContent, list } from "../http/respond";
import { NotFoundError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";
import type { PathParams, RequestBody } from "../http/contract";

const recordNotFound = () =>
  new NotFoundError("Record not found", { code: ErrorCodes.PHOSPHATE_RECORD_NOT_FOUND });

export async function handleGetPhosphateData(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getPhosphateData();
    list(res, data, "Retrieved phosphate data.");
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
    // The contract requires a UUID `loc_id` and rejects `id` (the DB assigns it).
    // Clients send `loc_id` flat; map it to the nested relation Prisma expects.
    const { loc_id, ...rest } = req.body as RequestBody<"/api/phosphate-data", "post">;
    const data = {
      ...rest,
      locations: { connect: { loc_id } },
    } as Prisma.phosphate_dataCreateInput;
    const record = await createRecord(data, loc_id);
    created(res, record, "Phosphate record created.", { id: record.id });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdatePhosphateData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as PathParams<"/api/phosphate-data/{id}">;

    // A bare `loc_id` scalar isn't valid on the update input — map it to the nested
    // relation when present; leave the rest of the body untouched.
    const { loc_id, ...rest } = req.body as RequestBody<"/api/phosphate-data/{id}", "patch">;
    const data = {
      ...rest,
      ...(loc_id !== undefined ? { locations: { connect: { loc_id } } } : {}),
    } as Prisma.phosphate_dataUpdateInput;

    const record = await updateRecord(id, data, loc_id);
    if (record === null) throw recordNotFound();
    ok(res, record, "Phosphate record updated.", { id });
  } catch (err) {
    next(err);
  }
}

export async function handleDeletePhosphateData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as PathParams<"/api/phosphate-data/{id}">;
    const record = await deleteRecord(id);
    if (record === null) throw recordNotFound();
    noContent(res);
  } catch (err) {
    next(err);
  }
}
