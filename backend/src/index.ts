import http from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import pool from './config/db';
import { s3, BUCKET_NAME, initStorage } from './config/storage';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import createTables from './models/schema';
import authRoutes from './routes/authRoutes';
import videoRoutes from './routes/videoRoutes';
import profileRoutes from './routes/profileRoutes';
import { protect } from './middleware/auth';
import { uploadPart } from './controllers/videoController';
import { globalErrorHandler } from './middleware/errorHandler';
import { initWorker } from './services/worker';
import { initCronJobs } from './services/cronService';
import { SocketService } from './services/socketService';

const app = express();

app.use(cors({
  origin: env.APP_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(cookieParser());

// Stream upload-part body to B2 (no buffering); must be before express.json() so body stays a stream
app.post('/api/videos/upload-part', protect, uploadPart);

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

    // 3. Worker
    initWorker();

    // 5. Cron
    initCronJobs();

    // 6. HTTP server and Socket.IO
    const server = http.createServer(app);
    new SocketService(server);

    // 7. Listen
    server.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT}`);
    });

  } catch (error) {
    console.error('Startup Failed:', error);
    process.exit(1);
  }
};

init();