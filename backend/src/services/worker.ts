import { Worker, Job } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3, BUCKET_NAME } from '../config/storage';
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

// Helper function to extract FPS and Duration using ffprobe
const probeVideo = (url: string): Promise<{ fps: number, duration: number }> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(url, (err, metadata) => {
      if (err) return reject(err);
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      
      // Default to 24fps if detection fails to prevent division by zero errors later
      let fps = 24;
      if (videoStream && videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/');
        if (den && parseFloat(den) !== 0) {
            fps = parseFloat(num) / parseFloat(den);
        }
      }

      const duration = metadata.format.duration || 0;
      resolve({ fps, duration });
    });
  });
};

const processVideo = async (job: Job) => {
  const { videoId, bucketPath } = job.data;
  // console.log(`Starting HLS conversion for ${videoId}...`);

  const videoDir = path.join(TMP_BASE, `hls-${videoId}`);
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);

  const outputUrl = path.join(videoDir, 'index.m3u8');
  const uploadedSegments = new Set<string>();

  try {
    // 1. Get Input Stream URL
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: bucketPath });
    const inputUrl = await getSignedUrl(s3, command, { expiresIn: 7200 });

    // 2. Extract Metadata (FPS & Duration)
    const { fps, duration } = await probeVideo(inputUrl);
    // console.log(`Metadata extracted: ${fps.toFixed(3)} FPS, ${duration}s`);

    // 3. Start the Concurrent Upload Poller
    const uploaderInterval = setInterval(async () => {
      try {
        const files = await readdir(videoDir);
        const tsFiles = files.filter(f => f.endsWith('.ts'));

        // Sort files by modification time to upload strictly in order
        const statsPromises = tsFiles.map(async file => {
          const stats = await stat(path.join(videoDir, file));
          return { file, mtime: stats.mtime.getTime() };
        });
        
        const fileStats = await Promise.all(statsPromises);
        fileStats.sort((a, b) => a.mtime - b.mtime);

        // Skip the newest file as FFmpeg might still be writing to it
        const safeFiles = fileStats.slice(0, -1);

        for (const { file } of safeFiles) {
          if (uploadedSegments.has(file)) continue;

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

    // 4. Run FFmpeg Transcoding
    await new Promise((resolve, reject) => {
      ffmpeg(inputUrl)
        .output(outputUrl)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size('1280x720')        // Downscale to 720p for performance
        .outputOptions([
          '-preset ultrafast',   // Prioritize speed
          '-threads 0',          // Utilize all CPU cores
          '-hls_time 10',        // 10-second segments
          '-hls_list_size 0',    // Persist all segments in playlist
          '-f hls'
        ])
        .on('end', () => {
          clearInterval(uploaderInterval);
          resolve(true);
        })
        .on('error', (err) => {
          clearInterval(uploaderInterval);
          reject(err);
        })
        .run();
    });

    // 5. Final Cleanup and Manifest Upload
    const finalFiles = await readdir(videoDir);
    for (const file of finalFiles) {
      const filePath = path.join(videoDir, file);
      const s3Key = `videos/${videoId}/${file}`;
      const contentType = file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T';

      await uploadFile(filePath, s3Key, contentType);
      
      if (fs.existsSync(filePath)) await unlink(filePath);
    }

    // 6. Update Database with Status and Metadata
    const manifestPath = `videos/${videoId}/index.m3u8`;
    await pool.query(
      `UPDATE videos 
       SET status = 'ready', 
           bucket_path = $1, 
           fps = $2, 
           duration = $3 
       WHERE id = $4`,
      [manifestPath, fps, duration, videoId]
    );

    // 7. Delete Raw Source File to Save Storage
    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: bucketPath
      }));
    } catch (cleanupErr) {
      console.error('Failed to delete raw file:', cleanupErr);
    }

  } catch (error) {
    console.error(`HLS processing failed for ${videoId}:`, error);
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