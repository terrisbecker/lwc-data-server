import { S3Client } from "@aws-sdk/client-s3";

if (!process.env.AWS_REGION) {
  throw new Error(
    "AWS_REGION is not set. Refusing to start — configure AWS_REGION in the environment.",
  );
}
if (!process.env.S3_BUCKET_NAME) {
  throw new Error(
    "S3_BUCKET_NAME is not set. Refusing to start — configure S3_BUCKET_NAME in the environment.",
  );
}

export const s3 = new S3Client({ region: process.env.AWS_REGION });
export const S3_BUCKET: string = process.env.S3_BUCKET_NAME;
