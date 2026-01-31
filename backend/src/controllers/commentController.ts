import { Response, NextFunction } from "express";
import pool from "../config/db";
import { AppError } from "../utils/appError";
import { AuthRequest } from "../middleware/auth";
import { SocketService } from "../services/socketService";

// Helper: Reuse the access check logic
const canComment = async (videoId: string, userId?: number, token?: string) => {
  const videoRes = await pool.query(
    "SELECT user_id, is_public, public_token, public_role FROM videos WHERE id = $1",
    [videoId],
  );
  if (videoRes.rowCount === 0) return false;
  const video = videoRes.rows[0];

  // 1. Owner
  if (userId && video.user_id === userId) return true;

  // 2. Team Editor
  if (userId) {
    const shareRes = await pool.query(
      "SELECT role FROM video_shares WHERE video_id = $1 AND user_id = $2",
      [videoId, userId],
    );
    if ((shareRes.rowCount || 0) > 0 && shareRes.rows[0].role === "editor")
      return true;
  }

  // 3. Public Editor
  if (
    video.is_public &&
    video.public_token === token &&
    video.public_role === "editor"
  ) {
    return true;
  }

  return false;
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
    // 1. Check Permissions
    const allowed = await canComment(id, req.user?.userId, token);
    if (!allowed) {
      return next(
        new AppError(
          "Permission denied: You cannot comment on this video",
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

    // 4. Calculate Frame Data
    const frameNumber = Math.round(parseFloat(timestamp) * fps);
    const durationFrames = duration
      ? Math.round(parseFloat(duration) * fps)
      : 0;

    // 5. Insert with Frame Data
    const result = await pool.query(
      `INSERT INTO comments 
        (video_id, user_id, guest_name, text, timestamp, frame_number, duration_frames, type, drawing_data, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        req.user?.userId || null,
        req.user ? null : guestName,
        text || "",
        timestamp,
        frameNumber, // The Source of Truth
        durationFrames,
        type || "text",
        drawing_data || null,
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
          userAvatar = userRes.rows[0].avatar_url;
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
      `SELECT c.*, u.name as user_name, u.email as user_email 
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.video_id = $1 
       ORDER BY c.frame_number ASC`,
      [id],
    );
    res.status(200).json({ status: "success", data: result.rows });
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

  try {
    const check = await pool.query(
      `SELECT c.user_id as author_id, v.user_id as owner_id 
       FROM comments c 
       JOIN videos v ON c.video_id = v.id 
       WHERE c.id = $1 AND c.video_id = $2`,
      [commentId, id],
    );

    if (check.rowCount === 0)
      return next(new AppError("Comment not found", 404));

    const { author_id, owner_id } = check.rows[0];
    const currentUserId = req.user?.userId;

    if (currentUserId !== owner_id && currentUserId !== author_id) {
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
