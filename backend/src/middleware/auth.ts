import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {redis} from '../config/redis';
import { env } from '../config/env';
import { AppError } from '../utils/appError';
import { TokenPayload } from '../types';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.auth_token;

  if (!token) {
    return next(new AppError('Not authorized to access this route', 401));
  }

  // --- 1. CHECK BLACKLIST ---
  const isBlacklisted = await redis.get(`blacklist:${token}`);
  if (isBlacklisted) {
    return next(new AppError('Session expired. Please login again.', 401));
  }

  try {
    // 2. Verify Token
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    req.user = { userId: decoded.userId, email: decoded.email };
    next();
  } catch (error) {
    return next(new AppError('Invalid token', 401));
  }
};

// Middleware that attempts to identify the user but allows the request to proceed if no token is present.
// This is used for public routes where we still want to know if the user is authenticated.
export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.auth_token;

  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
      req.user = decoded;
    } catch (error) {
      // If token is invalid, we simply ignore it and treat the user as unauthenticated (guest).
      // We do not throw an error here.
    }
  }
  next();
};