import { cleanEnv, str, port, url } from 'envalid';
import dotenv from 'dotenv';

dotenv.config();

const raw = cleanEnv(process.env, {
  // Ports (single source: change API_PORT/APP_PORT and URLs + docker ports follow)
  API_PORT: port({ default: 8000 }),
  APP_PORT: port({ default: 3000 }),
  // Database (we build DATABASE_URL from these)
  POSTGRES_HOST: str({ default: 'db' }),
  POSTGRES_USER: str({ default: 'postgres' }),
  POSTGRES_PASSWORD: str({ default: 'postgres' }),
  POSTGRES_DB: str({ default: 'framesync' }),
  //
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  REDIS_URL: url(),
  JWT_SECRET: str(),
  JWT_EXPIRES_IN: str({ default: '7d' }),
  S3_ENDPOINT: url(),
  S3_ACCESS_KEY: str(),
  S3_SECRET_KEY: str(),
  S3_BUCKET: str({ default: 'videos' }),
  S3_REGION: str({ default: 'us-east-1' }),
  VIDEO_RETENTION_HOURS: str({ default: '24' }),
  GOOGLE_CLIENT_ID: str({ default: '' }),
  GOOGLE_CLIENT_SECRET: str({ default: '' }),
  COOKIE_SECURE: str({ choices: ['true', 'false'], default: 'false' }),
  COOKIE_HTTPONLY: str({ choices: ['true', 'false'], default: 'true' }),
  COOKIE_SAMESITE: str({ choices: ['strict', 'lax', 'none'], default: 'strict' }),
  COOKIE_MAX_AGE: str({ default: '604800' }),
});

const encode = (s: string) => encodeURIComponent(s);

// URLs: from API_URL/APP_URL if set (production), else http://localhost:API_PORT and http://localhost:APP_PORT
const apiBase = process.env.API_URL?.trim() || `http://localhost:${raw.API_PORT}`;
const appBase = process.env.APP_URL?.trim() || `http://localhost:${raw.APP_PORT}`;

export const env = {
  ...raw,
  PORT: raw.API_PORT,
  API_URL: apiBase,
  APP_URL: appBase,
  FRONTEND_URL: appBase,
  BACKEND_PUBLIC_URL: apiBase,
  DATABASE_URL: `postgres://${encode(raw.POSTGRES_USER)}:${encode(raw.POSTGRES_PASSWORD)}@${raw.POSTGRES_HOST}:5432/${raw.POSTGRES_DB}`,
};
