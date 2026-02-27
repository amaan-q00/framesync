import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { AppError } from '../utils/appError';
import { TokenPayload } from '../types';

export interface AuthRequest extends Request {
  user?: TokenPayload;
  authToken?: string;
}

// JWT only: Bearer header, or ?auth= for GET (manifest – player can't send headers)
export function getAuthToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  if (req.method === 'GET' && typeof req.query?.auth === 'string') return req.query.auth;
  return undefined;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getAuthToken(req);

  if (!token) {
    return next(new AppError('Not authorized to access this route', 401));
  }

  req.authToken = token;

  const isBlacklisted = await redis.get(`blacklist:${token}`);
  if (isBlacklisted) {
    return next(new AppError('Session expired. Please login again.', 401));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    req.user = { userId: decoded.userId, email: decoded.email };
    next();
  } catch (error) {
    return next(new AppError('Invalid token', 401));
  }
};

// optional auth for watch/public routes
export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getAuthToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
      req.user = decoded;
    } catch {
      // invalid token = treat as guest
    }
  }
  next();
};