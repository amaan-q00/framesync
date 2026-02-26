import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis';

// Separate resilient connection (retry + TLS) so job adds work after idle disconnect (e.g. Upstash)
export const videoQueue = new Queue('video-transcoding', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3, // If FFmpeg crashes, retry 3 times
    backoff: {
      type: 'exponential',
      delay: 1000, // Wait 1s, then 2s, then 4s and so on
    },
  },
});

// Helper to Add Job called "transcode"
export const addVideoJob = async (videoId: string, bucketPath: string) => {
  await videoQueue.add('transcode', {
    videoId,
    bucketPath,
  });
  console.log(`Job added to queue for Video ${videoId}`);
};