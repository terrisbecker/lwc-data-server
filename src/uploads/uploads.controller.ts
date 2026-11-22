import type { Request, Response, NextFunction } from "express";
import {
  generatePresignedPutUrls,
  confirmUploads,
  getPresignedGetUrl,
  listUserUploads,
  PUT_EXPIRY_SECONDS,
  GET_EXPIRY_SECONDS,
} from "./uploads.service";
import { ok, created, list } from "../http/respond";
import { NotFoundError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";
import type { PathParams, RequestBody } from "../http/contract";

// The contract bounds both bodies: 1–10 files, each with an allowed contentType and
// a sizeBytes of 1 byte to 10 MB; uploadIds is a non-empty array of UUIDs.

export async function handleGeneratePresignedUrls(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { files } = req.body as RequestBody<"/api/uploads/presigned-urls", "post">;
    const data = await generatePresignedPutUrls(req.user!.id, files);
    created(res, data, "Upload URLs issued.", {
      count: data.length,
      expiresInSeconds: PUT_EXPIRY_SECONDS,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleConfirmUploads(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { uploadIds } = req.body as RequestBody<"/api/uploads/confirm", "post">;
    const confirmed = await confirmUploads(req.user!.id, uploadIds);

    // A partial confirm (ids that don't exist or aren't yours) is still a 200, as
    // documented in the contract; the message and meta make the shortfall visible.
    ok(res, { confirmed }, `Confirmed ${confirmed} of ${uploadIds.length} uploads.`, {
      requested: uploadIds.length,
      confirmed,
      skipped: uploadIds.length - confirmed,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetPresignedGetUrl(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as PathParams<"/api/uploads/{id}/url">;
    const data = await getPresignedGetUrl(id);
    if (!data) {
      throw new NotFoundError("Upload not found", { code: ErrorCodes.UPLOAD_NOT_FOUND });
    }
    ok(res, data, "Download URL issued.", { expiresInSeconds: GET_EXPIRY_SECONDS });
  } catch (err) {
    next(err);
  }
}

export async function handleListUploads(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await listUserUploads(req.user!.id);
    list(res, data, "Retrieved your uploads.");
  } catch (err) {
    next(err);
  }
}
