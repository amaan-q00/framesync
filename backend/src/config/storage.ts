import { 
  S3Client, 
  CreateBucketCommand, 
  HeadBucketCommand 
} from '@aws-sdk/client-s3';
import { env } from './env';

const isDev = env.NODE_ENV === 'development';
const publicEndpoint = isDev ? 'http://127.0.0.1:9000' : env.S3_ENDPOINT;
export const BUCKET_NAME = env.S3_BUCKET;

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: isDev,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export const s3Signer = new S3Client({
  region: env.S3_REGION,
  endpoint: publicEndpoint,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: isDev,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export const initStorage = async () => {
  console.log(`Connecting to Storage: ${env.S3_ENDPOINT} (${BUCKET_NAME})`);

  try {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        console.log(`Bucket '${BUCKET_NAME}' not found. Creating it...`);
        await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
        console.log(`Bucket Created.`);
      } else {
        throw err;
      }
    }

  } catch (error) {
    console.error('Storage Init Failed:', error);
  }
};