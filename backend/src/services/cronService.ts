import cron from 'node-cron';
import pool from '../config/db';
import { redis } from '../config/redis';
import { s3, BUCKET_NAME } from '../config/storage';
import { env } from '../config/env';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const RETENTION_HOURS = parseInt(env.VIDEO_RETENTION_HOURS || '24');

export const initCronJobs = () => {
  console.log('Initializing System Cron Jobs...');

  cron.schedule('* * * * *', async () => {
    await syncViews();
  });

  cron.schedule('0 * * * *', async () => {
    console.log('Running Hourly Cleanup Job...');
    await cleanupExpiredVideos();
  });

  cron.schedule('*/5 * * * *', async () => {
    await markStaleUploadsFailed();
  });
  
  console.log(`- View Sync: Active (1 min interval)`);
  console.log(`- Cleanup: Active (Older than ${RETENTION_HOURS} hours)`);
  console.log(`- Stale uploads: Mark as failed every 5 min`);
};

const STALE_UPLOAD_MINUTES = 30;

const markStaleUploadsFailed = async () => {
  try {
    const result = await pool.query(
      `UPDATE videos SET status = 'failed'
       WHERE status = 'uploading'
         AND created_at < NOW() - INTERVAL '1 minute' * $1
       RETURNING id`,
      [STALE_UPLOAD_MINUTES]
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`Marked ${result.rowCount} stale upload(s) as failed`);
    }
  } catch (err) {
    console.error('Stale upload cleanup failed:', err);
  }
};

const syncViews = async () => {
  try {
    const keys = await redis.keys('video:views:*');
    if (keys.length === 0) return;

    for (const key of keys) {
      const viewsToAdd = await redis.getset(key, '0');
      const count = parseInt(viewsToAdd || '0', 10);

      if (count > 0) {
        const videoId = key.split(':')[2];
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
      await deleteFolder(`videos/${videoId}/`);
      await deleteFolder(`thumbnails/${videoId}/`);

      await pool.query('DELETE FROM videos WHERE id = $1', [videoId]);
      console.log(`Purged Video: ${videoId}`);
    }

  } catch (error) {
    console.error('Video Cleanup Job Failed:', error);
  }
};

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