import type { Request, Response, NextFunction } from "express";
import {
  generatePresignedPutUrls,
  confirmUploads,
  getPresignedGetUrl,
  listUserUploads,
  ALLOWED_CONTENT_TYPES,
  MAX_FILES,
  MAX_SIZE_BYTES,
  type FileRequest,
} from "./uploads.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleGeneratePresignedUrls(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { files } = req.body as { files?: unknown };

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: { message: "files must be a non-empty array" } });
    return;
  }
  if (files.length > MAX_FILES) {
    res.status(400).json({ error: { message: `Maximum ${MAX_FILES} files per request` } });
    return;
  }

  for (const file of files) {
    if (
      typeof file !== "object" ||
      file === null ||
      typeof (file as Record<string, unknown>).filename !== "string" ||
      typeof (file as Record<string, unknown>).contentType !== "string" ||
      typeof (file as Record<string, unknown>).sizeBytes !== "number"
    ) {
      res.status(400).json({
        error: { message: "Each file must have filename (string), contentType (string), and sizeBytes (number)" },
      });
      return;
    }
    const f = file as FileRequest;
    if (!ALLOWED_CONTENT_TYPES[f.contentType]) {
      res.status(400).json({
        error: {
          message: `Content type "${f.contentType}" is not allowed. Allowed: ${Object.keys(ALLOWED_CONTENT_TYPES).join(", ")}`,
        },
      });
      return;
    }
    if (f.sizeBytes <= 0 || f.sizeBytes > MAX_SIZE_BYTES) {
      res.status(400).json({
        error: { message: `File "${f.filename}" must be between 1 byte and 10MB` },
      });
      return;
    }
  }

  try {
    const data = await generatePresignedPutUrls(req.user!.id, files as FileRequest[]);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function handleConfirmUploads(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { uploadIds } = req.body as { uploadIds?: unknown };

  if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
    res.status(400).json({ error: { message: "uploadIds must be a non-empty array" } });
    return;
  }
  if (uploadIds.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
    res.status(400).json({ error: { message: "All uploadIds must be valid UUIDs" } });
    return;
  }

  try {
    const confirmed = await confirmUploads(req.user!.id, uploadIds as string[]);
    res.json({ data: { confirmed } });
  } catch (err) {
    next(err);
  }
}

export async function handleGetPresignedGetUrl(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!UUID_RE.test(req.params.id as string)) {
    res.status(400).json({ error: { message: "Invalid id" } });
    return;
  }

  try {
    const data = await getPresignedGetUrl(req.params.id as string);
    if (!data) {
      res.status(404).json({ error: { message: "Upload not found" } });
      return;
    }
    res.json({ data });
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
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
