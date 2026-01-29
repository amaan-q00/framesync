import { Worker, Job } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3, BUCKET_NAME } from '../config/storage'; // Using Internal s3 client
import { redis } from '../config/redis';
import pool from '../config/db';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);

const TMP_BASE = path.resolve('temp');
if (!fs.existsSync(TMP_BASE)) {
  fs.mkdirSync(TMP_BASE);
}

const uploadFile = async (localPath: string, bucketKey: string, contentType: string) => {
  const fileContent = fs.readFileSync(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: bucketKey,
    Body: fileContent,
    ContentType: contentType,
  }));
};

const processVideo = async (job: Job) => {
  const { videoId, bucketPath } = job.data;
  console.log(`Starting HLS conversion for ${videoId}...`);

  const videoDir = path.join(TMP_BASE, `hls-${videoId}`);
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);

  const outputUrl = path.join(videoDir, 'index.m3u8');
  const uploadedSegments = new Set<string>();

  try {
    // 1. Get Input Stream URL (Internal Docker Network)
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: bucketPath });
    const inputUrl = await getSignedUrl(s3, command, { expiresIn: 7200 });

    console.log(`Stream URL generated`);

    // 2. Start the "Hot Upload" Poller
    const uploaderInterval = setInterval(async () => {
      try {
        const files = await readdir(videoDir);
        const tsFiles = files.filter(f => f.endsWith('.ts'));

        // Sort files by modification time
        const statsPromises = tsFiles.map(async file => {
          const stats = await stat(path.join(videoDir, file));
          return { file, mtime: stats.mtime.getTime() };
        });
        
        const fileStats = await Promise.all(statsPromises);
        fileStats.sort((a, b) => a.mtime - b.mtime); // Oldest first

        // Skip the newest file as FFmpeg might still be writing to it
        const safeFiles = fileStats.slice(0, -1);

        for (const { file } of safeFiles) {
          if (uploadedSegments.has(file)) continue;

          console.log(`Uploading segment: ${file}`);
          const filePath = path.join(videoDir, file);
          const s3Key = `videos/${videoId}/${file}`;

          await uploadFile(filePath, s3Key, 'video/MP2T');
          uploadedSegments.add(file);
          
          await unlink(filePath); 
        }
      } catch (err) {
        console.error('Uploader error (non-fatal):', err);
      }
    }, 5000); 

    // 3. Run FFmpeg with Performance Optimizations
    await new Promise((resolve, reject) => {
      ffmpeg(inputUrl)
        .output(outputUrl)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size('1280x720')        // Downscale to 720p for speed
        .outputOptions([
          '-preset ultrafast',   // Fastest encoding preset
          '-threads 0',          // Use all available CPU cores
          '-hls_time 10',        // 10-second segments
          '-hls_list_size 0',    // Include all segments in playlist
          '-f hls'               // HLS format
        ])
        .on('start', (cmd) => {
          console.log('FFmpeg process started');
          console.log('Command:', cmd);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
             console.log(`Processing: ${Math.floor(progress.percent)}% done`);
          } else {
             console.log(`Processing: ${progress.timemark}`);
          }
        })
        .on('end', () => {
          clearInterval(uploaderInterval);
          console.log('FFmpeg process finished');
          resolve(true);
        })
        .on('error', (err) => {
          clearInterval(uploaderInterval);
          console.error('FFmpeg Error:', err.message);
          reject(err);
        })
        .run();
    });

    // 4. Final Cleanup
    console.log('Performing final cleanup and manifest upload...');
    const finalFiles = await readdir(videoDir);
    for (const file of finalFiles) {
      const filePath = path.join(videoDir, file);
      const s3Key = `videos/${videoId}/${file}`;
      const contentType = file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T';

      console.log(`Final Upload: ${file}`);
      await uploadFile(filePath, s3Key, contentType);
      
      if (fs.existsSync(filePath)) await unlink(filePath);
    }

    // 5. Update Database
    const manifestPath = `videos/${videoId}/index.m3u8`;
    await pool.query(
      `UPDATE videos SET status = 'ready', bucket_path = $1 WHERE id = $2`,
      [manifestPath, videoId]
    );

    console.log(`HLS Processing Complete for ${videoId}`);

  } catch (error) {
    console.error(`HLS Failed for ${videoId}:`, error);
    await pool.query("UPDATE videos SET status = 'failed' WHERE id = $1", [videoId]);
    throw error;
  } finally {
    if (fs.existsSync(videoDir)) {
      fs.rmSync(videoDir, { recursive: true, force: true });
    }
  }
};

export const initWorker = () => {
  const worker = new Worker('video-transcoding', processVideo, {
    connection: {
      host: redis.options.host,
      port: redis.options.port,
    },
    concurrency: 1, 
    lockDuration: 120000, 
  });
  console.log('HLS Worker initialized');
};