import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

// LOGIC GATE:
// 1. Dev: We are inside Docker. We talk to 'minio:9000', but Browser talks to '127.0.0.1:9000'.
// 2. Prod: We are on Render. We talk to 'supabase.co', and Browser talks to 'supabase.co'.
const isDev = env.NODE_ENV === 'development';

// The URL the browser needs to see
const publicEndpoint = isDev ? 'http://127.0.0.1:9000' : env.S3_ENDPOINT;

// 1. Internal Client (Backend Operations like Worker)
export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT, // Dev: http://minio:9000 | Prod: https://aws...
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: isDev, // MinIO needs true, AWS/Supabase needs false
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// 2. Public Signer (Generates URLs for the Frontend)
export const s3Signer = new S3Client({
  region: env.S3_REGION,
  endpoint: publicEndpoint, // Dev: http://127.0.0.1:9000 | Prod: Same as Internal
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: isDev,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export const BUCKET_NAME = env.S3_BUCKET;