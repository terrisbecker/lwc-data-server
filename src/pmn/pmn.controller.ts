import type { Request, Response, NextFunction } from "express";
import {
  getCombinedFieldData,
  createRecord,
  updateRecord,
  deleteRecord,
  getPublicScumPhotoUrl,
} from "./pmn.service";
import { Prisma } from "../../generated/prisma/client";
import { GET_EXPIRY_SECONDS } from "../uploads/uploads.service";
import { ok, created, noContent, list } from "../http/respond";
import { requireUuidParam, optionalBooleanQuery } from "../http/validate";
import { NotFoundError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";

const recordNotFound = () =>
  new NotFoundError("Record not found", { code: ErrorCodes.PMN_RECORD_NOT_FOUND });

export async function handleGetCombinedFieldData(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const hasScum = optionalBooleanQuery(req.query.hasScum, "hasScum");
    const data = await getCombinedFieldData(hasScum);
    list(
      res,
      data,
      "Retrieved PMN combined field data.",
      hasScum === undefined ? undefined : { filters: { hasScum } },
    );
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
    created(res, data, "PMN record created.", { id: data.id });
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
    const id = requireUuidParam(req.params.id);
    const record = await updateRecord(id, req.body as Prisma.pmn_combined_field_dataUpdateInput);
    if (record === null) throw recordNotFound();
    ok(res, record, "PMN record updated.", { id });
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
    const record = await deleteRecord(requireUuidParam(req.params.id));
    if (record === null) throw recordNotFound();
    noContent(res);
  } catch (err) {
    next(err);
  }
}

export async function handleGetScumPhotoUrl(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await getPublicScumPhotoUrl(requireUuidParam(req.params.uploadId, "uploadId"));
    if (!data) {
      // Deliberately indistinguishable from "no such upload": this endpoint is
      // public, so it must not reveal which upload ids exist. No `details` here
      // for the same reason — see getPublicScumPhotoUrl in pmn.service.ts.
      throw new NotFoundError("Scum photo not found", {
        code: ErrorCodes.PMN_SCUM_PHOTO_NOT_FOUND,
      });
    }
    ok(res, data, "Scum photo URL issued.", { expiresInSeconds: GET_EXPIRY_SECONDS });
  } catch (err) {
    next(err);
  }
}
