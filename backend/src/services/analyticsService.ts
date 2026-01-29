import { redis } from '../config/redis';
import pool from '../config/db';

export class AnalyticsService {
  // Inrement in redis
  static async incrementView(videoId: string) {
    await redis.incr(`video:view_count:${videoId}`);
  }

  // Batch Write to DB
  static async syncViewsToDB() {
    const keys = await redis.keys('video:view_count:*');
    if (keys.length === 0) return;

    const pipeline = redis.pipeline();
    keys.forEach((key) => {
      pipeline.get(key);
      pipeline.del(key);
    });

    const results = await pipeline.exec();

    if (results) {
      for (let i = 0; i < keys.length; i++) {
        const [err, count] = results[i * 2];
        if (!err && count) {
          const videoId = keys[i].split(':').pop();
          await pool.query('UPDATE videos SET views = views + $1 WHERE id = $2', [count, videoId]);
        }
      }
    }
    console.log(`Synced views for ${keys.length} videos`);
  }
}