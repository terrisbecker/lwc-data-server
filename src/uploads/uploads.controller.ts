import type { Request, Response, NextFunction } from "express";
import {
  generatePresignedPutUrls,
  confirmUploads,
  getPresignedGetUrl,
  listUserUploads,
  ALLOWED_CONTENT_TYPES,
  MAX_FILES,
  MAX_SIZE_BYTES,
  PUT_EXPIRY_SECONDS,
  GET_EXPIRY_SECONDS,
  type FileRequest,
} from "./uploads.service";
import { ok, created, list } from "../http/respond";
import { requireUuidParam, requireArray, requireUuidArray } from "../http/validate";
import { BadRequestError, NotFoundError } from "../http/api.error";
import { ErrorCodes } from "../http/error.codes";

const MAX_SIZE_LABEL = `${MAX_SIZE_BYTES / (1024 * 1024)}MB`;

export async function handleGeneratePresignedUrls(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { files } = req.body as { files?: unknown };

    requireArray(files, "files", {
      max: MAX_FILES,
      message: "files must be a non-empty array",
      maxMessage: `Maximum ${MAX_FILES} files per request`,
    });

    for (const file of files as unknown[]) {
      if (
        typeof file !== "object" ||
        file === null ||
        typeof (file as Record<string, unknown>).filename !== "string" ||
        typeof (file as Record<string, unknown>).contentType !== "string" ||
        typeof (file as Record<string, unknown>).sizeBytes !== "number"
      ) {
        throw new BadRequestError(
          "Each file must have filename (string), contentType (string), and sizeBytes (number)",
          {
            code: ErrorCodes.INVALID_FIELD,
            details: { field: "files[]", required: ["filename", "contentType", "sizeBytes"] },
          },
        );
      }
      const f = file as FileRequest;
      if (!ALLOWED_CONTENT_TYPES[f.contentType]) {
        throw new BadRequestError(
          `Content type "${f.contentType}" is not allowed. Allowed: ${Object.keys(ALLOWED_CONTENT_TYPES).join(", ")}`,
          {
            code: ErrorCodes.INVALID_FIELD,
            details: { field: "contentType", allowed: Object.keys(ALLOWED_CONTENT_TYPES) },
          },
        );
      }
      // The size bound is derived from MAX_SIZE_BYTES so the message can never
      // drift from the limit actually enforced.
      if (f.sizeBytes <= 0 || f.sizeBytes > MAX_SIZE_BYTES) {
        throw new BadRequestError(
          `File "${f.filename}" must be between 1 byte and ${MAX_SIZE_LABEL}`,
          {
            code: ErrorCodes.INVALID_FIELD,
            details: { field: "sizeBytes", maxBytes: MAX_SIZE_BYTES, received: f.sizeBytes },
          },
        );
      }
    }

    const data = await generatePresignedPutUrls(req.user!.id, files as FileRequest[]);
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
    const { uploadIds } = req.body as { uploadIds?: unknown };

    const ids = requireUuidArray(uploadIds, "uploadIds", {
      message: "uploadIds must be a non-empty array",
      itemMessage: "All uploadIds must be valid UUIDs",
    });

    const confirmed = await confirmUploads(req.user!.id, ids);

    // `data` keeps its historical nested shape. A partial confirm (ids that don't
    // exist or aren't yours) is still a 200 — the message and meta are what make
    // the shortfall visible. Turning it into a 4xx would break existing clients
    // and is tracked separately.
    ok(res, { confirmed }, `Confirmed ${confirmed} of ${ids.length} uploads.`, {
      requested: ids.length,
      confirmed,
      skipped: ids.length - confirmed,
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
    const data = await getPresignedGetUrl(requireUuidParam(req.params.id));
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
