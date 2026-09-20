import type { Request, Response, NextFunction } from "express";
import { getPhosphateData, createRecord, updateRecord, deleteRecord } from "./watershed.service";
import { Prisma } from "../../generated/prisma/client";
import { ok, created, noContent, list } from "../http/respond";
import { requireUuidParam, requireUuidField } from "../http/validate";
import { NotFoundError, BadRequestError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";

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
    // Strip `id` — the DB assigns the UUID; accepting a client-supplied id would
    // allow callers to force a specific primary key. Clients send a flat `loc_id`,
    // which we map to the nested relation Prisma expects.
    const { id: _id, loc_id, ...rest } = req.body as Record<string, unknown>;

    if (loc_id === undefined) {
      throw new BadRequestError("loc_id is required", {
        code: ErrorCodes.MISSING_FIELD,
        details: { field: "loc_id" },
      });
    }
    const locationId = requireUuidField(loc_id, "loc_id");

    const data = {
      ...rest,
      locations: { connect: { loc_id: locationId } },
    } as Prisma.phosphate_dataCreateInput;
    const record = await createRecord(data, locationId);
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
    const id = requireUuidParam(req.params.id);

    // A bare `loc_id` scalar isn't valid on the update input — map it to the nested
    // relation when present; leave the rest of the body untouched.
    const { loc_id, ...rest } = req.body as Record<string, unknown>;
    const locationId = loc_id === undefined ? undefined : requireUuidField(loc_id, "loc_id");

    const data = {
      ...rest,
      ...(locationId !== undefined ? { locations: { connect: { loc_id: locationId } } } : {}),
    } as Prisma.phosphate_dataUpdateInput;

    const record = await updateRecord(id, data, locationId);
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
    const record = await deleteRecord(requireUuidParam(req.params.id));
    if (record === null) throw recordNotFound();
    noContent(res);
  } catch (err) {
    next(err);
  }
}
