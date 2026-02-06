import cron from 'node-cron';
import pool from '../config/db';
import { redis } from '../config/redis';
import { s3, BUCKET_NAME } from '../config/storage';
import { env } from '../config/env';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

// Configurable Retention Period
const RETENTION_HOURS = parseInt(env.VIDEO_RETENTION_HOURS || '24');

export const initCronJobs = () => {
  console.log('Initializing System Cron Jobs...');

  // 1. VIEW SYNC (Every Minute)
  // Flushes Redis view counts to Postgres
  cron.schedule('* * * * *', async () => {
    await syncViews();
  });

  // 2. CLEANUP (Every Hour)
  // Deletes expired temp videos from S3 and DB
  cron.schedule('0 * * * *', async () => {
    console.log('Running Hourly Cleanup Job...');
    await cleanupExpiredVideos();
  });
  
  console.log(`- View Sync: Active (1 min interval)`);
  console.log(`- Cleanup: Active (Older than ${RETENTION_HOURS} hours)`);
};

// --- JOB 1: VIEW ANALYTICS SYNC ---
const syncViews = async () => {
  try {
    // Scan for all view keys
    // Note: In extremely high-load Redis, use SCAN instead of KEYS
    const keys = await redis.keys('video:views:*');
    if (keys.length === 0) return;

    for (const key of keys) {
      // Atomically get the value and reset it to 0
      const viewsToAdd = await redis.getset(key, '0');
      const count = parseInt(viewsToAdd || '0', 10);

      if (count > 0) {
        const videoId = key.split(':')[2];
        
        // Batch updates could be optimized further, but this is fine for now
        await pool.query(
          'UPDATE videos SET views = views + $1 WHERE id = $2',
          [count, videoId]
        );
      }
    }
  } catch (err) {
    console.error('View Sync Job Failed:', err);
  }
};

// --- JOB 2: VIDEO CLEANUP ---
const cleanupExpiredVideos = async () => {
  try {
    const result = await pool.query(
      `SELECT id, bucket_path FROM videos 
       WHERE created_at < NOW() - INTERVAL '${RETENTION_HOURS} hours'
       AND status != 'uploading'` 
    );

    if (result.rowCount === 0) return;

    console.log(`Found ${result.rowCount} expired videos. Cleaning up...`);

    for (const video of result.rows) {
      const videoId = video.id;
      const folderPrefix = `videos/${videoId}/`;

      await deleteFolder(folderPrefix);
      
      await pool.query('DELETE FROM videos WHERE id = $1', [videoId]);
      console.log(`Purged Video: ${videoId}`);
    }

  } catch (error) {
    console.error('Video Cleanup Job Failed:', error);
  }
};

// Helper: Delete S3 Folder
const deleteFolder = async (prefix: string) => {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix
    });
    const listResult = await s3.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) return;

    const deleteParams = {
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: listResult.Contents.map(obj => ({ Key: obj.Key })),
        Quiet: true
      }
    };

    await s3.send(new DeleteObjectsCommand(deleteParams));

    if (listResult.IsTruncated) {
      await deleteFolder(prefix);
    }
  } catch (err) {
    console.error(`Failed to delete S3 folder ${prefix}:`, err);
  }
};