import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError';
import { AuthRequest } from '../middleware/auth';
import pool from '../config/db';
import { ProfileUpdateInput } from '../types';
import { s3, BUCKET_NAME } from '../config/storage';
import { toPresignedAssetUrl } from '../utils/presigned';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, avatar_url, created_at FROM users WHERE id = $1',
      [req.user?.userId]
    );

    if (!result.rowCount) {
      return next(new AppError('User not found', 404));
    }

    const user = result.rows[0];
    const avatar_url = await toPresignedAssetUrl(user.avatar_url, 604800);
    res.status(200).json({
      status: 'success',
      data: { ...user, avatar_url }
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, avatar_url }: ProfileUpdateInput = req.body;
    const userId = req.user?.userId;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      return next(new AppError('No fields to update', 400));
    }

    values.push(userId);

    const query = `
      UPDATE users 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, email, name, avatar_url, created_at
    `;

    const result = await pool.query(query, values);

    if (!result.rowCount) {
      return next(new AppError('User not found', 404));
    }

    const user = result.rows[0];
    const resolvedAvatarUrl = await toPresignedAssetUrl(user.avatar_url, 604800);
    res.status(200).json({
      status: 'success',
      data: { user: { ...user, avatar_url: resolvedAvatarUrl } }
    });
  } catch (error) {
    next(error);
  }
};

export const uploadAvatar = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file || !req.file.buffer) {
      return next(new AppError('No file uploaded', 400));
    }

    const file = req.file;
    const userId = req.user?.userId;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return next(new AppError('Invalid file type. Only JPEG, PNG, and WebP are allowed', 400));
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return next(new AppError('File too large. Maximum size is 5MB', 400));
    }

    const fileExtension = file.originalname.split('.').pop();
    const fileName = `avatar_${userId}_${Date.now()}.${fileExtension}`;
    const key = `avatars/${fileName}`;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3.send(new PutObjectCommand(uploadParams));

    await pool.query(
      'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2',
      [key, userId]
    );

    const avatar_url = await toPresignedAssetUrl(key, 604800);
    res.status(200).json({
      status: 'success',
      data: { avatar_url }
    });

  } catch (error) {
    console.error('Avatar upload error:', error);
    next(new AppError('Avatar upload failed', 500));
  }
};
