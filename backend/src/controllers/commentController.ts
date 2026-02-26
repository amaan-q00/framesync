import { Response, NextFunction } from "express";
import pool from "../config/db";
import { AppError } from "../utils/appError";
import { AuthRequest } from "../middleware/auth";
import { SocketService } from "../services/socketService";
import { toPresignedAssetUrl } from "../utils/presigned";

// Permission helper: same access logic as checkVideoAccess (owner, team, public).
// canAddComment: anyone with access; canAddMarkers: owner or editor only (not viewers).
const getCommentPermissions = async (
  videoId: string,
  userId?: number,
  token?: string
): Promise<{ canAddComment: boolean; canAddMarkers: boolean }> => {
  const videoRes = await pool.query(
    "SELECT user_id, is_public, public_token, public_role FROM videos WHERE id = $1",
    [videoId],
  );
  if (videoRes.rowCount === 0) return { canAddComment: false, canAddMarkers: false };
  const video = videoRes.rows[0];

  // 1. Owner
  if (userId && video.user_id === userId) {
    return { canAddComment: true, canAddMarkers: true };
  }

  // 2. Team (editor or viewer)
  if (userId) {
    const shareRes = await pool.query(
      "SELECT role FROM video_shares WHERE video_id = $1 AND user_id = $2",
      [videoId, userId],
    );
    if ((shareRes.rowCount || 0) > 0) {
      const role = shareRes.rows[0].role as string;
      return {
        canAddComment: true,
        canAddMarkers: role === "editor",
      };
    }
  }

  // 3. Public (editor or viewer via token)
  if (video.is_public && video.public_token === token) {
    const role = (video.public_role as string) || "viewer";
    return {
      canAddComment: true,
      canAddMarkers: role === "editor",
    };
  }

  return { canAddComment: false, canAddMarkers: false };
};

// POST /api/videos/:id/comments
export const addComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as { id: string };
  const { text, timestamp, type, drawing_data, color, duration, guestName } =
    req.body;
  const { token } = req.query as { token?: string };

  try {
    // 1. Check Permissions (anyone with access can add comment; only editor/owner can add markers)
    const { canAddComment, canAddMarkers } = await getCommentPermissions(
      id,
      req.user?.userId,
      token,
    );
    if (!canAddComment) {
      return next(
        new AppError(
          "Permission denied: You cannot comment on this video",
          403,
        ),
      );
    }
    const commentType = type || "text";
    if (
      (commentType === "marker" || commentType === "shape") &&
      !canAddMarkers
    ) {
      return next(
        new AppError(
          "Permission denied: Only editors can add markers or shapes",
          403,
        ),
      );
    }

    // 2. Validate Guest Name
    if (!req.user && !guestName) {
      return next(new AppError("Guest name is required", 400));
    }

    // 3. Get Video FPS (Critical for sync)
    const videoMeta = await pool.query("SELECT fps FROM videos WHERE id = $1", [
      id,
    ]);
    if (videoMeta.rowCount === 0)
      return next(new AppError("Video not found", 404));

    const fps = videoMeta.rows[0].fps || 24.0;

    // 4. Calculate Frame Data (markers/shapes: at least 1 second visibility)
    const frameNumber = Math.round(parseFloat(timestamp) * fps);
    let durationFrames = duration
      ? Math.round(parseFloat(duration) * fps)
      : 0;
    if (type === "marker" || type === "shape") {
      const minFrames = Math.max(1, Math.round(fps));
      durationFrames = Math.max(durationFrames, minFrames);
    }

    // 5. Normalize drawing_data for JSONB: array of strokes (legacy) or { segments: [{ startTime, endTime, strokes }] }
    let drawingDataForDb: string | null = null;
    if (drawing_data != null) {
      try {
        const parsed =
          typeof drawing_data === "string"
            ? JSON.parse(drawing_data)
            : drawing_data;
        if (Array.isArray(parsed)) {
          drawingDataForDb = parsed.length > 0 ? JSON.stringify(parsed) : "[]";
        } else if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray(parsed.segments) &&
          parsed.segments.length > 0
        ) {
          drawingDataForDb = JSON.stringify(parsed);
        }
      } catch {
        drawingDataForDb = null;
      }
    }

    // 6. Insert with Frame Data (cast $9 to jsonb when string for pg)
    const result = await pool.query(
      `INSERT INTO comments 
        (video_id, user_id, guest_name, text, timestamp, frame_number, duration_frames, type, drawing_data, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING *`,
      [
        id,
        req.user?.userId || null,
        req.user ? null : guestName,
        text ?? "",
        timestamp,
        frameNumber, // The Source of Truth
        durationFrames,
        commentType,
        drawingDataForDb,
        color || "#FF0000",
      ],
    );

    const savedComment = result.rows[0];

    // --- 6. SOCKET BROADCAST (THE BRIDGE) ---
    try {
      const io = SocketService.getInstance().getIO();

      let userName = guestName || "Guest";
      let userAvatar = null;

      // If logged in, we need to FETCH the name/avatar for the broadcast
      if (req.user?.userId) {
        const userRes = await pool.query(
          "SELECT name, avatar_url FROM users WHERE id = $1",
          [req.user.userId],
        );
        if (userRes.rowCount && userRes.rowCount > 0) {
          userName = userRes.rows[0].name;
          userAvatar = await toPresignedAssetUrl(userRes.rows[0].avatar_url, 604800);
        }
      }

      const payload = {
        ...savedComment,
        user_name: userName,
        user_avatar: userAvatar,
      };

      io.to(id).emit("new_comment", payload);

      if (savedComment.type === "marker") {
        io.to(id).emit("lock_update", { lockedBy: null });
      }
    } catch (err) {
      console.error("Socket broadcast failed:", err);
    }

    res.status(201).json({ status: "success", data: savedComment });
  } catch (error) {
    next(error);
  }
};

// GET /api/videos/:id/comments
export const getComments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as { id: string };

  try {
    const result = await pool.query(
      `SELECT c.*, u.name as user_name, u.email as user_email, u.avatar_url as user_avatar 
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.video_id = $1 
       ORDER BY c.created_at ASC`,
      [id],
    );
    const data = await Promise.all(
      result.rows.map(async (row) => ({
        ...row,
        user_avatar: await toPresignedAssetUrl(row.user_avatar, 604800),
      })),
    );
    res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/videos/:id/comments/:commentId
export const deleteComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const { id, commentId } = req.params as { id: string; commentId: string };
  const guestName = (req.body?.guestName ?? req.query?.guestName) as string | undefined;

  try {
    const check = await pool.query(
      `SELECT c.user_id as author_id, c.guest_name as author_guest_name, v.user_id as owner_id 
       FROM comments c 
       JOIN videos v ON c.video_id = v.id 
       WHERE c.id = $1 AND c.video_id = $2`,
      [commentId, id],
    );

    if (check.rowCount === 0)
      return next(new AppError("Comment not found", 404));

    const { author_id, author_guest_name, owner_id } = check.rows[0];
    const currentUserId = req.user?.userId;

    // Owner can delete any comment
    if (currentUserId !== undefined && currentUserId === owner_id) {
      // allowed
    } else if (author_id != null && currentUserId === author_id) {
      // Non-owner: can delete own (logged-in author)
    } else if (author_id == null && author_guest_name != null && guestName != null && author_guest_name === guestName) {
      // Guest: can delete own comment by matching guest_name
    } else {
      return next(new AppError("You can only delete your own comments", 403));
    }

    await pool.query("DELETE FROM comments WHERE id = $1", [commentId]);

    // Broadcast Deletion
    try {
      const io = SocketService.getInstance().getIO();
      io.to(id).emit("delete_comment", { commentId });
    } catch (err) {
      console.error("Socket broadcast failed:", err);
    }

    res.status(200).json({ status: "success", message: "Comment deleted" });
  } catch (error) {
    next(error);
  }
};
