import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { redis } from '../config/redis';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { env } from '../config/env';
import { AuthService } from '../services/authService';
import { RegisterSchema, LoginSchema } from '../schemas/auth.schema';
import { AppError } from '../utils/appError';
import { User, SafeUser } from '../types';

// Initialize Google Client
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = RegisterSchema.parse(req.body);
    const result = await AuthService.register(validatedData);
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = LoginSchema.parse(req.body);
    const result = await AuthService.login(validatedData);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

// --- NEW: GOOGLE AUTH ---
export const googleLogin = async (req: Request, res: Response, next: NextFunction) => {
  const { token } = req.body; // Expects { token: "google_id_token" }

  try {
    // 1. Verify Token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return next(new AppError('Invalid Google Token', 400));
    }

    const { email, name, picture, sub: googleId } = payload;

    // 2. Check DB
    const userRes = await pool.query<User>('SELECT * FROM users WHERE email = $1', [email]);
    let user = userRes.rows[0];

    if (!user) {
      // SCENARIO A: New User -> Create Account
      const newUserRes = await pool.query<User>(
        `INSERT INTO users (email, name, avatar_url, google_id) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, email, name, avatar_url, created_at`,
        [email, name, picture, googleId]
      );
      user = newUserRes.rows[0];
    } else {
      // SCENARIO B: Existing User -> Link Google ID if missing
      if (!user.google_id || !user.avatar_url) {
         const updateRes = await pool.query<User>(
           `UPDATE users 
            SET google_id = COALESCE(google_id, $1), 
                avatar_url = COALESCE(avatar_url, $2) 
            WHERE id = $3
            RETURNING id, email, name, avatar_url, created_at`,
           [googleId, picture, user.id]
         );
         user = updateRes.rows[0];
      }
    }

    // 3. Issue JWT
    const jwtToken = jwt.sign(
        { userId: user.id, email: user.email }, 
        env.JWT_SECRET, 
        { expiresIn: '7d' }
    );

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      created_at: user.created_at
    };

    res.status(200).json({
      status: 'success',
      token: jwtToken,
      data: { user: safeUser }
    });

  } catch (error) {
    console.error('Google Auth Error:', error);
    next(new AppError('Google Authentication Failed', 401));
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(200).json({ status: 'success', message: 'Logged out successfully' });
  }

  try {
    // 1. Decode to get expiration time
    const decoded = jwt.decode(token) as any;
    
    // If token is already invalid/malformed, just return success
    if (!decoded || !decoded.exp) {
       return res.status(200).json({ status: 'success' });
    }

    // 2. Calculate remaining time in seconds
    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - now;

    // 3. Add to Redis Blacklist
    if (ttl > 0) {
      // Key: "blacklist:eyJ...", Value: "true", Expiry: remaining seconds
      await redis.setex(`blacklist:${token}`, ttl, 'true');
    }

    res.status(200).json({ status: 'success', message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};