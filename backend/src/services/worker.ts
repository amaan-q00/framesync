import { Worker, Job } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3, BUCKET_NAME } from '../config/storage';
import { createRedisConnection } from '../config/redis';
import pool from '../config/db';
import { promisify } from 'util';
import { SocketService } from './socketService';

const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);

function emitVideoStatus(
  videoId: string,
  status: 'ready' | 'failed',
  ownerUserId: number | undefined
): void {
  if (ownerUserId == null) return;
  try {
    const io = SocketService.getInstance().getIO();
    io.to(`user:${ownerUserId}`).emit('video:status', { videoId, status });
  } catch { }
}

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

const probeVideo = (url: string): Promise<{ fps: number; duration: number }> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(url, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      let fps = 24;
      if (videoStream?.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/');
        if (den && parseFloat(den) !== 0) fps = parseFloat(num) / parseFloat(den);
      }
      const duration = metadata.format.duration ?? 0;
      resolve({ fps, duration });
    });
  });
};

// one ffmpeg pass: thumb + HLS, no double read
const runThumbnailAndHls = (
  inputUrl: string,
  thumbPath: string,
  hlsOutputPath: string,
  fps: number,
  duration: number
): Promise<void> => {
  const thumbFrame = Math.round(fps * (duration > 0 ? Math.min(1, duration * 0.1) : 0));
  const filterComplex = [
    '[0:v]split=2[thumb_in][hls_in]',
    `[thumb_in]select=eq(n\\,${thumbFrame}),scale=320:-1:flags=fast_bilinear[vthumb]`,
    '[hls_in]scale=1280:720:flags=fast_bilinear[hlsv]',
  ].join(';');
  const args = [
    '-i', inputUrl,
    '-filter_complex', filterComplex,
    '-map', '[vthumb]', '-vframes', '1', '-q:v', '3', '-f', 'image2', thumbPath,
    '-map', '[hlsv]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '0',
    '-c:a', 'aac',
    '-hls_time', '10', '-hls_list_size', '0', '-f', 'hls', hlsOutputPath,
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', reject);
  });
};

const processVideo = async (job: Job) => {
  const { videoId, bucketPath } = job.data;

  const videoDir = path.join(TMP_BASE, `hls-${videoId}`);
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);

  const outputUrl = path.join(videoDir, 'index.m3u8');
  const uploadedSegments = new Set<string>();

  try {
    await pool.query("UPDATE videos SET status = 'processing' WHERE id = $1", [videoId]);

    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: bucketPath });
    const inputUrl = await getSignedUrl(s3, command, { expiresIn: 7200 });

    const { fps, duration } = await probeVideo(inputUrl);
    await pool.query(
      'UPDATE videos SET fps = $1, duration = $2 WHERE id = $3',
      [fps, duration, videoId]
    );

    // upload .ts as they stabilise (mtime unchanged 2s) so we dont grab half-written file
    const STABLE_MS = 2000;
    const uploaderInterval = setInterval(async () => {
      try {
        const files = await readdir(videoDir);
        const tsFiles = files.filter((f) => f.endsWith('.ts'));
        const statsPromises = tsFiles.map(async (file) => {
          const stats = await stat(path.join(videoDir, file));
          return { file, mtime: stats.mtime.getTime() };
        });
        const fileStats = await Promise.all(statsPromises);
        const now = Date.now();
        for (const { file, mtime } of fileStats) {
          if (uploadedSegments.has(file)) continue;
          if (now - mtime < STABLE_MS) continue;
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

    const thumbPath = path.join(videoDir, 'thumb.jpg');
    await runThumbnailAndHls(inputUrl, thumbPath, outputUrl, fps, duration);
    clearInterval(uploaderInterval);

    let thumbnailKey: string | null = null;
    try {
      thumbnailKey = `thumbnails/${videoId}/thumb.jpg`;
      await uploadFile(thumbPath, thumbnailKey, 'image/jpeg');
      if (fs.existsSync(thumbPath)) await unlink(thumbPath);
    } catch (thumbErr) {
      console.error(`Thumbnail upload failed for ${videoId}:`, thumbErr);
    }

    const finalFiles = await readdir(videoDir);
    for (const file of finalFiles) {
      const filePath = path.join(videoDir, file);
      const s3Key = `videos/${videoId}/${file}`;
      const contentType = file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T';

      await uploadFile(filePath, s3Key, contentType);
      
      if (fs.existsSync(filePath)) await unlink(filePath);
    }

    const manifestPath = `videos/${videoId}/index.m3u8`;
    const updateRes = await pool.query(
      `UPDATE videos 
       SET status = 'ready', 
           bucket_path = $1, 
           thumbnail_path = $2,
           fps = $3, 
           duration = $4 
       WHERE id = $5
       RETURNING user_id`,
      [manifestPath, thumbnailKey ?? null, fps, duration, videoId]
    );
    const ownerUserId = updateRes.rows[0]?.user_id as number | undefined;
    emitVideoStatus(videoId, 'ready', ownerUserId);

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
    const failRes = await pool.query(
      "UPDATE videos SET status = 'failed' WHERE id = $1 RETURNING user_id",
      [videoId]
    );
    const ownerUserId = failRes.rows[0]?.user_id as number | undefined;
    emitVideoStatus(videoId, 'failed', ownerUserId);
    throw error;
  } finally {
    if (fs.existsSync(videoDir)) {
      fs.rmSync(videoDir, { recursive: true, force: true });
    }
  }
};

export const initWorker = () => {
  const worker = new Worker('video-transcoding', processVideo, {
    connection: createRedisConnection(),
    concurrency: 1,
    lockDuration: 120000,
  });
  console.log('HLS Worker initialized');
};