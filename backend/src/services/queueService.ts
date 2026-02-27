import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis';

export const videoQueue = new Queue('video-transcoding', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

export const addVideoJob = async (videoId: string, bucketPath: string) => {
  await videoQueue.add('transcode', {
    videoId,
    bucketPath,
  });
  console.log(`Job added to queue for Video ${videoId}`);
};