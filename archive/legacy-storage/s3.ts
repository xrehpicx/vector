import { env } from "@/env";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.S3_ENDPOINT ?? undefined,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

function getPublicUrlForKey(key: string) {
  if (env.S3_PUBLIC_BASE_URL) {
    return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }

  if (env.S3_ENDPOINT) {
    // For custom endpoints (MinIO/R2) assume path-style
    return `${env.S3_ENDPOINT.replace(/\/$/, "")}/${env.AWS_S3_BUCKET}/${key}`;
  }

  // Default AWS pattern
  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}

/**
 * Generate a pre-signed URL to PUT an object directly to S3.
 * The returned URL expires after `expiresIn` seconds.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 60,
) {
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ACL: "private",
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  const publicUrl = getPublicUrlForKey(key);
  return { uploadUrl, publicUrl } as const;
}

/**
 * Generate a presigned GET URL for reading a private object
 */
export async function getPresignedReadUrl(
  key: string,
  expiresIn = 3600, // 1 hour default
) {
  const command = new GetObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

export { getPublicUrlForKey };
