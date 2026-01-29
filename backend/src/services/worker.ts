import { Worker, Job } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { s3, BUCKET_NAME } from '../config/storage';
import { redis } from '../config/redis';
import pool from '../config/db';

// Ensure temp directory exists
const TMP_DIR = path.resolve('temp');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR);
}

// Helper: Download from S3 to Local Disk
const downloadFile = async (bucketKey: string, localPath: string) => {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: bucketKey });
  const response = await s3.send(command);
  
  // Stream data to file
  const stream = response.Body as Readable;
  const file = fs.createWriteStream(localPath);
  
  return new Promise((resolve, reject) => {
    stream.pipe(file).on('finish', resolve).on('error', reject);
  });
};

// Helper: Upload Local File to S3
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
  console.log(`Processing Video ${videoId}...`);

  const inputPath = path.join(TMP_DIR, `input-${videoId}.mp4`);
  const outputPath = path.join(TMP_DIR, `output-${videoId}.mp4`);
  const thumbPath = path.join(TMP_DIR, `thumb-${videoId}.jpg`);

  try {
    // Download Raw Video
    await downloadFile(bucketPath, inputPath);

    // Generate Thumbnail (Screenshot at 1 sec)
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          count: 1,
          folder: TMP_DIR,
          filename: `thumb-${videoId}.jpg`,
          timestamps: ['1'], // Take shot at 1st second
          size: '320x180'
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Transcode Video (720p, H.264, Optimized for Web)
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .videoCodec('libx264')
        .size('1280x720') // Downscale to 720p
        .audioCodec('aac')
        .outputOptions([
          '-movflags +faststart', // Critical for web streaming!
          '-preset fast',         // Balance speed/quality
          '-crf 23'               // Standard quality
        ])
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Upload Processed Files
    const processedKey = `processed/${videoId}.mp4`;
    const thumbKey = `thumbnails/${videoId}.jpg`;

    await uploadFile(outputPath, processedKey, 'video/mp4');
    await uploadFile(thumbPath, thumbKey, 'image/jpeg');

    // Update Database
    await pool.query(
      `UPDATE videos 
       SET status = 'ready', bucket_path = $1, thumbnail_path = $2 
       WHERE id = $3`,
      [processedKey, thumbKey, videoId]
    );

    console.log(`Video ${videoId} processing complete!`);

  } catch (error) {
    console.error(`Processing failed for ${videoId}:`, error);
    // Mark as failed in DB
    await pool.query("UPDATE videos SET status = 'failed' WHERE id = $1", [videoId]);
    throw error; // Let BullMQ handle retry logic
  } finally {
    //Cleanup Temp Files
    [inputPath, outputPath, thumbPath].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  }
};

// Initialize the Worker
export const initWorker = () => {
  const worker = new Worker('video-transcoding', processVideo, {
    connection: {
      host: redis.options.host,
      port: redis.options.port,
    },
    concurrency: 1, // Process 1 job at once
    lockDuration: 120000, // 2 minutes process lock 
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });
  
  console.log('Video Worker initialized and listening...');
};