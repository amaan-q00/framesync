import { Request, Response, NextFunction } from 'express';
import { 
  CreateMultipartUploadCommand, 
  UploadPartCommand, 
  CompleteMultipartUploadCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pool from '../config/db';
import { s3, s3Signer, BUCKET_NAME } from '../config/storage';
import { addVideoJob } from '../services/queueService';
import { AppError } from '../utils/appError';
import { AuthRequest } from '../middleware/auth';

export const initializeMultipart = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { fileName, fileType, title, description } = req.body;
  const userId = req.user?.userId;

  try {
    const result = await pool.query(
      `INSERT INTO videos (user_id, title, description, bucket_path, status)
       VALUES ($1, $2, $3, 'PENDING', 'uploading')
       RETURNING id`,
      [userId, title, description || '']
    );
    const videoId = result.rows[0].id;
    const objectKey = `raw/${videoId}-${Date.now()}.${fileName.split('.').pop()}`;

    await pool.query('UPDATE videos SET bucket_path = $1 WHERE id = $2', [objectKey, videoId]);

    const command = new CreateMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      ContentType: fileType,
    });
    
    // Use internal s3 client to initiate the session
    const multipart = await s3.send(command);

    res.status(200).json({
      status: 'success',
      data: {
        videoId,
        uploadId: multipart.UploadId,
        key: objectKey
      },
    });
  } catch (error) {
    next(error);
  }
};

export const signPart = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { key, uploadId, partNumber } = req.body;

  try {
    const command = new UploadPartCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    // Use s3Signer to generate a URL valid for the frontend (handling localhost/prod differences)
    const signedUrl = await getSignedUrl(s3Signer, command, { expiresIn: 3600 });

    res.status(200).json({
      status: 'success',
      data: { url: signedUrl }
    });
  } catch (error) {
    next(error);
  }
};

export const completeMultipart = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { videoId, key, uploadId, parts } = req.body; 

  try {
    const result = await pool.query('SELECT * FROM videos WHERE id = $1 AND user_id = $2', [videoId, req.user?.userId]);
    if (result.rowCount === 0) return next(new AppError('Video not found', 404));

    const command = new CompleteMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    });

    await s3.send(command);

    await pool.query("UPDATE videos SET status = 'queued' WHERE id = $1", [videoId]);
    await addVideoJob(videoId, key);

    res.status(200).json({
      status: 'success',
      message: 'Upload complete. Video queued.'
    });

  } catch (error) {
    console.error("Multipart Complete Failed:", error);
    next(error);
  }
};