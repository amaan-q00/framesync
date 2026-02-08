import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import pool from './config/db';
import { s3, BUCKET_NAME, initStorage } from './config/storage';
import { CreateBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import createTables from './models/schema';
import authRoutes from './routes/authRoutes';
import videoRoutes from './routes/videoRoutes';
import profileRoutes from './routes/profileRoutes';
import { globalErrorHandler } from './middleware/errorHandler';
import { initWorker } from './services/worker';
import { initCronJobs } from './services/cronService';

const app = express();

app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(cookieParser());

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/profile', profileRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', env: env.NODE_ENV });
});

app.use(globalErrorHandler);

const init = async () => {
  try {
    // 1. Database
    await pool.query('SELECT 1');
    console.log('Database Connected');
    await createTables();
    await initStorage();

    // 2. Storage Setup (Bucket creation)
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
      console.log(`Bucket '${BUCKET_NAME}' ready`);
    } catch (e: any) {
      if (e.Code !== 'BucketAlreadyOwnedByYou') throw e;
    }

    // 3. Storage CORS Setup (Soft Fail)
    try {
      await s3.send(new PutBucketCorsCommand({
        Bucket: BUCKET_NAME,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
              AllowedOrigins: ["*"],
              ExposeHeaders: ["ETag"]
            }
          ]
        }
      }));
      console.log('MinIO CORS Configured via SDK');
    } catch (error: any) {
      console.warn('WARNING: Automatic CORS configuration failed. Manual configuration may be required.');
      console.warn(`Error: ${error.message}`);
    }

    // 4. Worker
    initWorker();

    // 5. Cron
    initCronJobs();

    // 6. Server
    app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT}`);
    });

  } catch (error) {
    console.error('Startup Failed:', error);
    process.exit(1);
  }
};

init();