import { 
  S3Client, 
  PutBucketPolicyCommand, 
  CreateBucketCommand, 
  HeadBucketCommand 
} from '@aws-sdk/client-s3';
import { env } from './env';

// LOGIC GATE:
// 1. Dev: We are inside Docker. We talk to 'minio:9000', but Browser talks to '127.0.0.1:9000'.
// 2. Prod: We are on Render. We talk to 'supabase.co', and Browser talks to 'supabase.co'.
const isDev = env.NODE_ENV === 'development';

// The URL the browser needs to see
const publicEndpoint = isDev ? 'http://127.0.0.1:9000' : env.S3_ENDPOINT;
export const BUCKET_NAME = env.S3_BUCKET;

// 1. Internal Client (Backend Operations like Worker & Policy Init)
export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT, // Dev: http://minio:9000 | Prod: https://aws...
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: isDev, // MinIO needs true
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

export const S3_PUBLIC_ENDPOINT = publicEndpoint;

// --- NEW: AUTOMATED INITIALIZATION ---
// This ensures your bucket exists and has the right permissions
// on every server restart.
export const initStorage = async () => {
  console.log(`🔌 Connecting to Storage: ${env.S3_ENDPOINT} (${BUCKET_NAME})`);

  try {
    // 1. Check if Bucket Exists
    try {
      await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        console.log(`Bucket '${BUCKET_NAME}' not found. Creating it...`);
        await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
        console.log(`Bucket Created.`);
      } else {
        throw err; // Real error (auth, network, etc.)
      }
    }

    // 2. Define Public Policy
    // Explicitly allow public read access ONLY to:
    // - /videos/* (HLS streams)
    // - /avatars/* (User profiles)
    // - /thumbnails/* (If you separate them)
    const publicPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadForAssets",
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [
            `arn:aws:s3:::${BUCKET_NAME}/videos/*`,
            `arn:aws:s3:::${BUCKET_NAME}/avatars/*`,
            `arn:aws:s3:::${BUCKET_NAME}/thumbnails/*`
            // Note: 'raw/*' is NOT included here, keeping original uploads private
          ]
        }
      ]
    };

    // 3. Apply Policy
    const command = new PutBucketPolicyCommand({
      Bucket: BUCKET_NAME,
      Policy: JSON.stringify(publicPolicy)
    });

    await s3.send(command);
    console.log('Storage Policy Sync: /videos, /avatars and /thumbnails are PUBLIC.');

  } catch (error) {
    console.error('Storage Init Failed:', error);
    // We do NOT exit process here. 
    // If Supabase/AWS has strict IAM policies preventing this, 
    // the app should still try to run.
  }
};