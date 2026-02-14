import { cleanEnv, str, port, url } from 'envalid';
import dotenv from 'dotenv';

dotenv.config();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  PORT: port({ default: 8000 }),
  FRONTEND_URL: url({ default: 'http://localhost:3000' }),
  DATABASE_URL: url(),
  REDIS_URL: url(),
  JWT_SECRET: str(),
  S3_ENDPOINT: url(),
  S3_ACCESS_KEY: str(),
  S3_SECRET_KEY: str(),
  S3_BUCKET: str({ default: 'videos' }),
  S3_REGION: str({ default: 'us-east-1' }),
  VIDEO_RETENTION_HOURS: str({ default: '24' }),
  GOOGLE_CLIENT_ID: str({ default: '' }),
  GOOGLE_CLIENT_SECRET: str({ default: '' }),
  /** Public URL of this API (for OAuth redirect_uri). e.g. http://localhost:8000 */
  BACKEND_PUBLIC_URL: url({ default: 'http://localhost:8000' }),
  // Cookie configuration
  COOKIE_SECURE: str({ choices: ['true', 'false'], default: 'false' }),
  COOKIE_HTTPONLY: str({ choices: ['true', 'false'], default: 'true' }),
  COOKIE_SAMESITE: str({ choices: ['strict', 'lax', 'none'], default: 'strict' }),
  COOKIE_MAX_AGE: str({ default: '604800' }), // 7 days in seconds
});