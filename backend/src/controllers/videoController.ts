import { Request, Response, NextFunction } from 'express';
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { toPresignedThumbnailUrl, toPresignedSegmentUrl } from '../utils/presigned';
import { randomBytes } from 'crypto';
import pool from '../config/db';
import { redis } from '../config/redis';
import { s3, s3Signer, BUCKET_NAME } from '../config/storage';
import { addVideoJob } from '../services/queueService';
import { SocketService } from '../services/socketService';
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
  
  if (videoResult.rowCount === 0) return { access: false, role: null, video: null, isPublicAccess: false };
  const video = videoResult.rows[0];

  // 2. Case A: Owner (Full Access)
  if (userId && video.user_id === userId) {
    return { access: true, role: 'owner', video, isPublicAccess: false };
  }

  // 3. Case B: Team Member (Editor/Viewer)
  if (userId) {
    const shareResult = await pool.query(
      'SELECT role FROM video_shares WHERE video_id = $1 AND user_id = $2',
      [videoId, userId]
    );
    if (shareResult.rowCount && shareResult.rowCount > 0) {
      return { access: true, role: shareResult.rows[0].role, video, isPublicAccess: false };
    }
  }

  // 4. Case C: Public Guest (Editor/Viewer via Token)
  if (video.is_public && video.public_token === publicToken) {
    return { access: true, role: video.public_role, video, isPublicAccess: true };
  }

  return { access: false, role: null, video: null, isPublicAccess: false };
};

// --- READ ROUTES ---

// GET /api/videos/my-works?limit=5&offset=0&search=...
export const getMyWorks = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const titleFilter = search ? `AND title ILIKE $2` : '';
    const countParams = search ? [req.user?.userId, `%${search}%`] : [req.user?.userId];
    const listParams = search ? [req.user?.userId, `%${search}%`, limit, offset] : [req.user?.userId, limit, offset];

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM videos WHERE user_id = $1 ${titleFilter}`,
      countParams
    );
    const total = countResult.rows[0]?.total ?? 0;

    const result = await pool.query(
      `SELECT id, title, thumbnail_path, status, views, created_at, is_public, public_token, public_role 
       FROM videos WHERE user_id = $1 ${titleFilter} ORDER BY created_at DESC LIMIT ${search ? '$3' : '$2'} OFFSET ${search ? '$4' : '$3'}`,
      listParams
    );
    const data = await Promise.all(result.rows.map(async (row: { thumbnail_path?: string | null; [k: string]: unknown }) => ({
      ...row,
      thumbnail_url: await toPresignedThumbnailUrl(row.thumbnail_path as string | null),
    })));
    res.status(200).json({ status: 'success', data, total });
  } catch (error) {
    next(error);
  }
};

// GET /api/videos/shared-with-me?limit=5&offset=0&search=...
export const getSharedWithMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const titleFilter = search ? `AND v.title ILIKE $2` : '';
    const countParams = search ? [req.user?.userId, `%${search}%`] : [req.user?.userId];
    const listParams = search ? [req.user?.userId, `%${search}%`, limit, offset] : [req.user?.userId, limit, offset];

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM video_shares vs JOIN videos v ON vs.video_id = v.id WHERE vs.user_id = $1 ${titleFilter}`,
      countParams
    );
    const total = countResult.rows[0]?.total ?? 0;

    const result = await pool.query(
      `SELECT v.id, v.title, v.thumbnail_path, v.status, v.views, v.created_at, u.name as owner_name, vs.role
       FROM video_shares vs
       JOIN videos v ON vs.video_id = v.id
       JOIN users u ON v.user_id = u.id
       WHERE vs.user_id = $1 ${titleFilter}
       ORDER BY vs.created_at DESC LIMIT ${search ? '$3' : '$2'} OFFSET ${search ? '$4' : '$3'}`,
      listParams
    );
    const data = await Promise.all(result.rows.map(async (row: { thumbnail_path?: string | null; [k: string]: unknown }) => ({
      ...row,
      thumbnail_url: await toPresignedThumbnailUrl(row.thumbnail_path as string | null),
    })));
    res.status(200).json({ status: 'success', data, total });
  } catch (error) {
    next(error);
  }
};

const HLS_SEGMENT_DURATION = 10; // matches worker -hls_time 10
const MIN_SEGMENTS_FOR_PLAYABLE = 1; // only expose manifest when at least this many chunks exist

/** Returns sorted .ts segment keys for a video (empty if none). */
async function listSegmentKeys(videoId: string): Promise<string[]> {
  const prefix = `videos/${videoId}/`;
  const listResult = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  }));
  const contents = listResult.Contents ?? [];
  return contents
    .filter((o): o is { Key: string } => (o.Key?.endsWith('.ts') ?? false))
    .map((o) => o.Key)
    .sort();
}

// GET /api/videos/:id/manifest.m3u8 (Progressive HLS playlist)
export const getManifest = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  const { token } = req.query as { token?: string };

  try {
    const { access, video } = await checkVideoAccess(id, req.user?.userId, token);
    if (!access || !video) {
      return next(new AppError('Access Denied or Video Not Found', 403));
    }

    const segmentKeys = await listSegmentKeys(id);

    if (segmentKeys.length === 0) {
      return res.status(404).set({ 'Cache-Control': 'no-cache' }).end();
    }

    const lines: string[] = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      `#EXT-X-TARGETDURATION:${HLS_SEGMENT_DURATION + 1}`,
    ];

    for (let i = 0; i < segmentKeys.length; i++) {
      const key = segmentKeys[i];
      const isLast = i === segmentKeys.length - 1;
      const duration = isLast ? HLS_SEGMENT_DURATION : HLS_SEGMENT_DURATION;
      lines.push(`#EXTINF:${duration.toFixed(3)},`);
      lines.push(await toPresignedSegmentUrl(key));
    }

    if (video.status === 'ready') {
      lines.push('#EXT-X-ENDLIST');
    }

    const body = lines.join('\n') + '\n';
    res
      .status(200)
      .set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
      })
      .send(body);
  } catch (error) {
    next(error);
  }
};

// GET /api/videos/:id (Watch Page)
export const getVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  const { token } = req.query as { token?: string }; 

  try {
    const { access, role, video, isPublicAccess } = await checkVideoAccess(id, req.user?.userId, token);

    if (!access || !video) {
      return next(new AppError('Access Denied or Video Not Found', 403));
    }

    // Increment View Count (Optimized with Redis)
    redis.incr(`video:views:${id}`).catch(err => 
      console.error(`Redis View Incr Failed for ${id}`, err)
  );

    const apiHost = env.API_URL;
    const manifestPath = `${apiHost}/api/videos/${id}/manifest.m3u8`;
    let playable = video.status === 'ready';
    if (video.status === 'processing') {
      const segmentKeys = await listSegmentKeys(id);
      playable = segmentKeys.length >= MIN_SEGMENTS_FOR_PLAYABLE;
    }
    const manifestUrl = playable
      ? isPublicAccess && token
        ? `${manifestPath}?token=${encodeURIComponent(token)}`
        : manifestPath
      : undefined;

    const thumbnail_url = await toPresignedThumbnailUrl(video.thumbnail_path);

    res.status(200).json({
      status: 'success',
      data: {
        ...video,
        role, // 'owner', 'editor', 'viewer'
        manifestUrl,
        thumbnail_url,
        isPublicAccess: Boolean(isPublicAccess),
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

    try {
      SocketService.getInstance().getIO().to(`user:${targetUserId}`).emit('share:added', { videoId: id });
    } catch {
      // Socket not initialized
    }
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
     try {
       SocketService.getInstance().getIO().to(`user:${userId}`).emit('share:removed', { videoId: id });
     } catch {
       // Socket not initialized
     }
     res.status(200).json({ status: 'success', message: 'User removed' });
  } catch (error) {
    next(error);
  }
};

// POST /api/videos/:id/public (Toggle Public Link)
// When public access is updated or modified in any way, we nullify all previous public links:
// - If enabling or keeping enabled: always generate a new token (invalidates old links).
// - If disabling: set token to null.
export const updatePublicAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  const { enabled, role } = req.body; // 'viewer' or 'editor'

  try {
    const videoCheck = await pool.query('SELECT user_id FROM videos WHERE id = $1', [id]);
    if (videoCheck.rowCount === 0 || videoCheck.rows[0].user_id !== req.user?.userId) {
      return next(new AppError('Permission Denied', 403));
    }

    let token: string | null = null;

    if (enabled) {
      // Any update/modification with public on: generate a fresh token so all previous public links are nullified.
      token = randomBytes(16).toString('hex');
    }
    // If enabled is false: token stays null, all public links are invalidated.

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

// Helper: delete all S3 objects under a prefix (used for video + thumbnail cleanup)
const deleteS3Prefix = async (prefix: string): Promise<void> => {
  const listResult = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix }));
  if (!listResult.Contents?.length) return;
  await s3.send(new DeleteObjectsCommand({
    Bucket: BUCKET_NAME,
    Delete: { Objects: listResult.Contents.map(obj => ({ Key: obj.Key! })), Quiet: true },
  }));
  if (listResult.IsTruncated) await deleteS3Prefix(prefix);
};

// DELETE /api/videos/:id (Owner only – deletes video and cascades, plus S3 video + thumbnail)
export const deleteVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params as { id: string };
  try {
    const videoCheck = await pool.query('SELECT user_id FROM videos WHERE id = $1', [id]);
    if (videoCheck.rowCount === 0) return next(new AppError('Video not found', 404));
    const ownerId = videoCheck.rows[0].user_id as number;
    if (ownerId !== req.user?.userId) {
      return next(new AppError('Only the owner can delete this video', 403));
    }
    const sharedRows = await pool.query<{ user_id: number }>(
      'SELECT user_id FROM video_shares WHERE video_id = $1',
      [id]
    );
    const sharedUserIds = sharedRows.rows.map((r) => r.user_id);
    await deleteS3Prefix(`videos/${id}/`);
    await deleteS3Prefix(`thumbnails/${id}/`);
    await pool.query('DELETE FROM videos WHERE id = $1', [id]);
    try {
      const io = SocketService.getInstance().getIO();
      io.to(`user:${ownerId}`).emit('video:deleted', { videoId: id });
      sharedUserIds.forEach((uid) => io.to(`user:${uid}`).emit('video:deleted', { videoId: id }));
    } catch {
      // Socket not initialized
    }
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
    const ownerRow = await pool.query<{ user_id: number }>('SELECT user_id FROM videos WHERE id = $1', [id]);
    const ownerId = ownerRow.rowCount ? ownerRow.rows[0]?.user_id : undefined;
    const deleted = await pool.query(
      'DELETE FROM video_shares WHERE video_id = $1 AND user_id = $2 RETURNING 1',
      [id, userId]
    );
    if (deleted.rowCount === 0) {
      return next(new AppError('Share not found or you do not have access', 404));
    }
    if (ownerId != null) {
      try {
        SocketService.getInstance().getIO().to(`user:${ownerId}`).emit('share:removed', { videoId: id });
      } catch {
        // Socket not initialized
      }
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

/** Proxy upload part: pass req stream directly to S3 (same as reference). */
export const uploadPart = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const key = req.query.key as string;
  const uploadId = req.query.uploadId as string;
  const partNumber = req.query.partNumber as string;

  try {
    if (!key || !uploadId || !partNumber) {
      return next(new AppError('Missing key, uploadId or partNumber', 400));
    }
    const partNum = parseInt(partNumber, 10);
    if (Number.isNaN(partNum) || partNum < 1) {
      return next(new AppError('Invalid partNumber', 400));
    }

    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (!contentLength) return next(new AppError('Missing Content-Length', 400));

    const command = new UploadPartCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNum,
      Body: req,
      ContentLength: contentLength,
    });

    const s3result = await s3.send(command);
    const etag = s3result.ETag ? s3result.ETag.replace(/"/g, '') : '';
    if (!etag) return next(new AppError('No ETag from storage', 502));

    res.status(200).json({ status: 'success', data: { etag } });
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