import { randomUUID } from "crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, S3_BUCKET } from "../s3";
import type { upload } from "../../generated/prisma/client";
import {
  createUploadRecords,
  confirmUploadRecords,
  findUploadById,
  findUploadsByUser,
} from "./uploads.queries";
import { InternalError } from "../http/api.error";
import { ErrorCodes, type ErrorCode } from "../http/error.codes";

export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

export const MAX_FILES = 10;
export const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const PUT_EXPIRY_SECONDS = 300; // 5 min
export const GET_EXPIRY_SECONDS = 900; // 15 min

// `message` names the failed operation for the log; the client sees publicMessage.
export class UploadsServiceError extends InternalError {
  constructor(
    message: string,
    cause?: unknown,
    code: ErrorCode = ErrorCodes.UPLOADS_LIST_FAILED,
    publicMessage = "The request could not be completed.",
  ) {
    super(message, { code, publicMessage, cause });
    this.name = "UploadsServiceError";
  }
}

export interface FileRequest {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface PresignedPutResult {
  uploadId: string;
  presignedUrl: string;
  objectKey: string;
}

export async function generatePresignedPutUrls(
  userId: string,
  files: FileRequest[],
): Promise<PresignedPutResult[]> {
  try {
    const records = files.map((file) => {
      const ext = ALLOWED_CONTENT_TYPES[file.contentType];
      const uuid = randomUUID();
      return {
        file,
        record: {
          id: uuid,
          user_id: userId,
          original_name: file.filename,
          object_key: `uploads/${userId}/${uuid}.${ext}`,
          content_type: file.contentType,
          size_bytes: file.sizeBytes,
          status: "pending",
        },
      };
    });

    await createUploadRecords(records.map(({ record }) => record));

    // Awaited inside the try for the same reason as confirmUploads below — a bare
    // `return` of the promise escapes this catch, so an S3 credential or signing
    // failure reached the error handler unwrapped and unclassified.
    return await Promise.all(
      records.map(async ({ record }) => {
        const command = new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: record.object_key,
          ContentType: record.content_type,
        });
        const presignedUrl = await getSignedUrl(s3, command, {
          expiresIn: PUT_EXPIRY_SECONDS,
        });
        return { uploadId: record.id, presignedUrl, objectKey: record.object_key };
      }),
    );
  } catch (cause) {
    throw new UploadsServiceError(
      "Failed to generate presigned upload URLs",
      cause,
      ErrorCodes.UPLOADS_PRESIGN_FAILED,
      "Upload URLs could not be issued. Please try again.",
    );
  }
}

export async function confirmUploads(userId: string, uploadIds: string[]): Promise<number> {
  try {
    // Must be awaited inside the try — a bare `return` of the promise escapes
    // this catch, so the rejection reached the error handler unwrapped.
    return await confirmUploadRecords(uploadIds, userId);
  } catch (cause) {
    throw new UploadsServiceError(
      "Failed to confirm uploads",
      cause,
      ErrorCodes.UPLOADS_CONFIRM_FAILED,
      "The uploads could not be confirmed. Please try again.",
    );
  }
}

export interface PresignedGetResult {
  url: string;
  contentType: string;
  originalName: string;
}

// Any volunteer/admin may view any upload (photos are shared record attachments), so
// there is no ownership check — the route's requireRole("volunteer") is the gate.
export async function getPresignedGetUrl(uploadId: string): Promise<PresignedGetResult | null> {
  try {
    const record = await findUploadById(uploadId);
    if (!record) return null;

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: record.object_key,
      ResponseContentDisposition: `inline; filename="${record.original_name}"`,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: GET_EXPIRY_SECONDS });
    return { url, contentType: record.content_type, originalName: record.original_name };
  } catch (cause) {
    throw new UploadsServiceError(
      "Failed to generate presigned download URL",
      cause,
      ErrorCodes.UPLOADS_DOWNLOAD_URL_FAILED,
      "The download URL could not be issued. Please try again.",
    );
  }
}

export async function listUserUploads(userId: string): Promise<upload[]> {
  try {
    // Awaited for the same reason as confirmUploads above.
    return await findUploadsByUser(userId);
  } catch (cause) {
    throw new UploadsServiceError(
      "Failed to list uploads",
      cause,
      ErrorCodes.UPLOADS_LIST_FAILED,
      "Your uploads could not be retrieved.",
    );
  }
}
