import { cleanEnv, str, port, url } from 'envalid';
import dotenv from 'dotenv';

dotenv.config();

const raw = cleanEnv(process.env, {
  PORT: port({ default: 8000 }),
  API_URL: url(),
  APP_URL: url(),
  DATABASE_URL: str({ default: '' }),
  POSTGRES_HOST: str({ default: 'localhost' }),
  POSTGRES_USER: str({ default: 'postgres' }),
  POSTGRES_PASSWORD: str({ default: 'postgres' }),
  POSTGRES_DB: str({ default: 'framesync' }),
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
const databaseUrl = raw.DATABASE_URL?.trim()
  || `postgresql://${encode(raw.POSTGRES_USER)}:${encode(raw.POSTGRES_PASSWORD)}@${raw.POSTGRES_HOST}:5432/${raw.POSTGRES_DB}`;

export const env = {
  ...raw,
  PORT: raw.PORT,
  API_URL: raw.API_URL,
  APP_URL: raw.APP_URL,
  DATABASE_URL: databaseUrl,
};
