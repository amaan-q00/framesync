import { Request, Response, NextFunction } from 'express';
import { 
  CreateMultipartUploadCommand, 
  UploadPartCommand, 
  CompleteMultipartUploadCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';
import pool from '../config/db';
import { redis } from '../config/redis';
import { s3, s3Signer, BUCKET_NAME } from '../config/storage';
import { addVideoJob } from '../services/queueService';
import { AppError } from '../utils/appError';
import { AuthRequest } from '../middleware/auth';
import { env } from '../config/env';

// --- HELPER: ACCESS CONTROL ---
const checkVideoAccess = async (videoId: string, userId?: number, publicToken?: string) => {
  // 1. Fetch Video + Owner
  const videoResult = await pool.query(
    `SELECT v.*, u.email as owner_email 
     FROM videos v 
     JOIN users u ON v.user_id = u.id 
     WHERE v.id = $1`, 
    [videoId]
  );
  
  if (videoResult.rowCount === 0) return { access: false, role: null, video: null };
  const video = videoResult.rows[0];

  // 2. Case A: Owner (Full Access)
  if (userId && video.user_id === userId) {
    return { access: true, role: 'owner', video };
  }

  // 3. Case B: Team Member (Editor/Viewer)
  if (userId) {
    const shareResult = await pool.query(
      'SELECT role FROM video_shares WHERE video_id = $1 AND user_id = $2',
      [videoId, userId]
    );
    if (shareResult.rowCount && shareResult.rowCount > 0) {
      return { access: true, role: shareResult.rows[0].role, video };
    }
  }

  // 4. Case C: Public Guest (Editor/Viewer via Token)
  if (video.is_public && video.public_token === publicToken) {
    // Return the specific role set in the DB (default is 'viewer')
    return { access: true, role: video.public_role, video };
  }

  return { access: false, role: null, video: null };
};

// --- READ ROUTES ---

// GET /api/videos/my-works?limit=5&offset=0
export const getMyWorks = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM videos WHERE user_id = $1',
      [req.user?.userId]
    );
    const total = countResult.rows[0]?.total ?? 0;

    const result = await pool.query(
      `SELECT id, title, thumbnail_path, status, views, created_at, is_public, public_token, public_role 
       FROM videos WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user?.userId, limit, offset]
    );
    const storageHost = env.NODE_ENV === 'development' ? 'http://127.0.0.1:9000' : env.S3_ENDPOINT;
    const data = result.rows.map((row: { thumbnail_path?: string | null; [k: string]: unknown }) => ({
      ...row,
      thumbnail_url: row.thumbnail_path ? `${storageHost}/${BUCKET_NAME}/${row.thumbnail_path}` : null,
    }));
    res.status(200).json({ status: 'success', data, total });
  } catch (error) {
    next(error);
  }
};

// GET /api/videos/shared-with-me?limit=5&offset=0
export const getSharedWithMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM video_shares vs WHERE vs.user_id = $1`,
      [req.user?.userId]
    );
    const total = countResult.rows[0]?.total ?? 0;

    const result = await pool.query(
      `SELECT v.id, v.title, v.thumbnail_path, v.status, v.views, v.created_at, u.name as owner_name, vs.role
       FROM video_shares vs
       JOIN videos v ON vs.video_id = v.id
       JOIN users u ON v.user_id = u.id
       WHERE vs.user_id = $1
       ORDER BY vs.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user?.userId, limit, offset]
    );
    const storageHost = env.NODE_ENV === 'development' ? 'http://127.0.0.1:9000' : env.S3_ENDPOINT;
    const data = result.rows.map((row: { thumbnail_path?: string | null; [k: string]: unknown }) => ({
      ...row,
      thumbnail_url: row.thumbnail_path ? `${storageHost}/${BUCKET_NAME}/${row.thumbnail_path}` : null,
    }));
    res.status(200).json({ status: 'success', data, total });
  } catch (error) {
    next(error);
  }
};

// GET /api/videos/:id (Watch Page)
export const getVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  const { token } = req.query as { token?: string }; 

  try {
    const { access, role, video } = await checkVideoAccess(id, req.user?.userId, token);

    if (!access || !video) {
      return next(new AppError('Access Denied or Video Not Found', 403));
    }

    // Increment View Count (Optimized with Redis)
    redis.incr(`video:views:${id}`).catch(err => 
      console.error(`Redis View Incr Failed for ${id}`, err)
  );

    const storageHost = env.NODE_ENV === 'development' 
      ? 'http://127.0.0.1:9000' 
      : env.S3_ENDPOINT;
      
    const manifestUrl = `${storageHost}/${BUCKET_NAME}/${video.bucket_path}`;

    res.status(200).json({
      status: 'success',
      data: {
        ...video,
        role, // 'owner', 'editor', 'viewer'
        manifestUrl
      }
    });

  } catch (error) {
    next(error);
  }
};

// --- SHARING ROUTES ---

// POST /api/videos/:id/share (Invite Team)
export const shareVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  const { email, role } = req.body; 

  try {
    const videoCheck = await pool.query('SELECT user_id FROM videos WHERE id = $1', [id]);
    if (videoCheck.rowCount === 0 || videoCheck.rows[0].user_id !== req.user?.userId) {
      return next(new AppError('Only the owner can share this video', 403));
    }

    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rowCount === 0) {
      return next(new AppError('User not found', 404));
    }
    const targetUserId = userResult.rows[0].id;

    if (targetUserId === req.user?.userId) {
      return next(new AppError('You cannot share with yourself', 400));
    }

    await pool.query(
      `INSERT INTO video_shares (video_id, user_id, role) 
       VALUES ($1, $2, $3)
       ON CONFLICT (video_id, user_id) DO UPDATE SET role = $3`,
      [id, targetUserId, role || 'viewer']
    );

    res.status(200).json({ status: 'success', message: 'User added to video' });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/videos/:id/share (Remove Team)
export const removeShare = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  const { userId } = req.body; 

  try {
     const videoCheck = await pool.query('SELECT user_id FROM videos WHERE id = $1', [id]);
     if (videoCheck.rowCount === 0 || videoCheck.rows[0].user_id !== req.user?.userId) {
       return next(new AppError('Permission Denied', 403));
     }

     await pool.query('DELETE FROM video_shares WHERE video_id = $1 AND user_id = $2', [id, userId]);
     res.status(200).json({ status: 'success', message: 'User removed' });
  } catch (error) {
    next(error);
  }
};

// POST /api/videos/:id/public (Toggle Public Link)
export const updatePublicAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  const { enabled, role } = req.body; // 'viewer' or 'editor'

  try {
    const videoCheck = await pool.query('SELECT user_id FROM videos WHERE id = $1', [id]);
    if (videoCheck.rowCount === 0 || videoCheck.rows[0].user_id !== req.user?.userId) {
      return next(new AppError('Permission Denied', 403));
    }

    let token = null;

    if (enabled) {
      // ALWAYS generate a fresh token when enabling.
      // This invalidates any previous links associated with this video.
      token = randomBytes(16).toString('hex');
    } 
    // If enabled is false, token remains null (effectively destroying the link)

    await pool.query(
      'UPDATE videos SET is_public = $1, public_token = $2, public_role = $3 WHERE id = $4',
      [enabled, token, role || 'viewer', id]
    );

    res.status(200).json({ 
      status: 'success', 
      data: { is_public: enabled, public_token: token, public_role: role || 'viewer' } 
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/videos/:id/shares (List users with access – owner only)
export const getVideoShares = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  try {
    const videoCheck = await pool.query('SELECT user_id FROM videos WHERE id = $1', [id]);
    if (videoCheck.rowCount === 0 || videoCheck.rows[0].user_id !== req.user?.userId) {
      return next(new AppError('Permission Denied', 403));
    }
    const result = await pool.query(
      `SELECT vs.user_id, u.email, u.name, vs.role
       FROM video_shares vs
       JOIN users u ON vs.user_id = u.id
       WHERE vs.video_id = $1
       ORDER BY vs.created_at ASC`,
      [id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/videos/:id (Owner only – deletes video and cascades)
export const deleteVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  try {
    const videoCheck = await pool.query('SELECT user_id FROM videos WHERE id = $1', [id]);
    if (videoCheck.rowCount === 0) return next(new AppError('Video not found', 404));
    if (videoCheck.rows[0].user_id !== req.user?.userId) {
      return next(new AppError('Only the owner can delete this video', 403));
    }
    await pool.query('DELETE FROM videos WHERE id = $1', [id]);
    res.status(200).json({ status: 'success', message: 'Video deleted' });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/videos/:id/share/me (Recipient removes their own access)
export const removeMyShare = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  const userId = req.user?.userId;
  try {
    const deleted = await pool.query(
      'DELETE FROM video_shares WHERE video_id = $1 AND user_id = $2 RETURNING 1',
      [id, userId]
    );
    if (deleted.rowCount === 0) {
      return next(new AppError('Share not found or you do not have access', 404));
    }
    res.status(200).json({ status: 'success', message: 'Access removed' });
  } catch (error) {
    next(error);
  }
};

// --- UPLOAD LOGIC ---
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