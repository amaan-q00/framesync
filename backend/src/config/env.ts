import { cleanEnv, str, port, url } from 'envalid';
import dotenv from 'dotenv';

dotenv.config();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  PORT: port({ default: 8000 }),
  FRONTEND_URL: url({ default: 'http://127.0.0.1:3000' }),
  DATABASE_URL: url(),
  REDIS_URL: url(),
  JWT_SECRET: str(),
  S3_ENDPOINT: url(),
  S3_ACCESS_KEY: str(),
  S3_SECRET_KEY: str(),
  S3_BUCKET: str({ default: 'videos' }),
  S3_REGION: str({ default: 'us-east-1' }),
  VIDEO_RETENTION_HOURS: str({ default: '24' }),
  GOOGLE_CLIENT_ID: str(),
});