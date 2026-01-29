import { Queue } from 'bullmq';
import { redis } from '../config/redis'; // reusing connection config

// Create the Queue 'video-transcoding'
export const videoQueue = new Queue('video-transcoding', {
  connection: {
    host: redis.options.host,
    port: redis.options.port,
  },
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