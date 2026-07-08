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

export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

export const MAX_FILES = 10;
export const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const PUT_EXPIRY_SECONDS = 300; // 5 min
const GET_EXPIRY_SECONDS = 900; // 15 min

export class UploadsServiceError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "UploadsServiceError";
    this.cause = cause;
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

    return Promise.all(
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
    throw new UploadsServiceError("Failed to generate presigned upload URLs", cause);
  }
}

export async function confirmUploads(userId: string, uploadIds: string[]): Promise<number> {
  try {
    return confirmUploadRecords(uploadIds, userId);
  } catch (cause) {
    throw new UploadsServiceError("Failed to confirm uploads", cause);
  }
}

export async function getPresignedGetUrl(userId: string, uploadId: string): Promise<string> {
  try {
    const record = await findUploadById(uploadId);
    if (!record) return "";
    if (record.user_id !== userId) return "";

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: record.object_key,
      ResponseContentDisposition: `inline; filename="${record.original_name}"`,
    });
    return getSignedUrl(s3, command, { expiresIn: GET_EXPIRY_SECONDS });
  } catch (cause) {
    throw new UploadsServiceError("Failed to generate presigned download URL", cause);
  }
}

export async function listUserUploads(userId: string): Promise<upload[]> {
  try {
    return findUploadsByUser(userId);
  } catch (cause) {
    throw new UploadsServiceError("Failed to list uploads", cause);
  }
}
