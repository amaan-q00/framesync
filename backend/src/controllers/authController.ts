import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { redis } from '../config/redis';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { env } from '../config/env';
import { AuthService } from '../services/authService';
import { RegisterSchema, LoginSchema } from '../schemas/auth.schema';
import { AppError } from '../utils/appError';
import { isValidEmailFormat } from '../utils/emailValidation';
import { User, SafeUser, CookieOptions } from '../types';
import { AuthRequest } from '../middleware/auth';
import { toPresignedAssetUrl } from '../utils/presigned';

// Google: ID token verification (for POST /google with token from frontend)
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

// Google: OAuth2 code flow (backend-driven; frontend just redirects here)
const googleRedirectUri = `${env.API_URL.replace(/\/$/, '')}/api/auth/google/callback`;
const googleOAuth2Client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri
);

// Helper function to set auth cookie
const setAuthCookie = (res: Response, token: string) => {
  const cookieOptions: CookieOptions = {
    maxAge: parseInt(env.COOKIE_MAX_AGE),
    httpOnly: env.COOKIE_HTTPONLY === 'true',
    secure: env.COOKIE_SECURE === 'true',
    sameSite: env.COOKIE_SAMESITE as 'strict' | 'lax' | 'none',
  };

  res.cookie('auth_token', token, cookieOptions);
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = RegisterSchema.parse(req.body);
    const result = await AuthService.register(validatedData);
    
    // Set auth cookie
    setAuthCookie(res, result.token);
    
    // Return user data without token
    res.status(201).json({ 
      status: 'success', 
      data: { user: result.user }
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = LoginSchema.parse(req.body);
    const result = await AuthService.login(validatedData);

    setAuthCookie(res, result.token);

    const avatar_url = await toPresignedAssetUrl(result.user.avatar_url, 604800);
    res.status(200).json({
      status: 'success',
      data: { user: { ...result.user, avatar_url } }
    });
  } catch (error) {
    next(error);
  }
};

// --- GOOGLE AUTH (shared user lookup) ---
async function findOrCreateGoogleUser(payload: { email: string; name?: string; picture?: string; sub: string }): Promise<User> {
  const { email, name, picture, sub: googleId } = payload;
  const userRes = await pool.query<User>('SELECT * FROM users WHERE email = $1', [email]);
  let user = userRes.rows[0];

  if (!user) {
    const newUserRes = await pool.query<User>(
      `INSERT INTO users (email, name, avatar_url, google_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, email, name, avatar_url, created_at`,
      [email, name ?? null, picture ?? null, googleId]
    );
    user = newUserRes.rows[0];
  } else if (!user.google_id || !user.avatar_url) {
    const updateRes = await pool.query<User>(
      `UPDATE users 
       SET google_id = COALESCE(google_id, $1), avatar_url = COALESCE(avatar_url, $2) 
       WHERE id = $3
       RETURNING id, email, name, avatar_url, created_at`,
      [googleId, picture ?? null, user.id]
    );
    user = updateRes.rows[0];
  }
  return user;
}

/** POST /api/auth/google — frontend sends ID token (e.g. from Google Identity Services). Kept for optional client-side flow. */
export const googleLogin = async (req: Request, res: Response, next: NextFunction) => {
  const { token } = req.body as { token?: string };
  if (!token) return next(new AppError('Token is required', 400));

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return next(new AppError('Invalid Google Token', 400));

    const user = await findOrCreateGoogleUser({
      email: payload.email,
      name: payload.name ?? undefined,
      picture: payload.picture ?? undefined,
      sub: payload.sub,
    });

    const jwtToken = jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
    setAuthCookie(res, jwtToken);
    const avatar_url = await toPresignedAssetUrl(user.avatar_url, 604800);
    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar_url,
          created_at: user.created_at,
        },
      },
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    next(new AppError('Google Authentication Failed', 401));
  }
};

/** GET /api/auth/google — start backend-driven OAuth. Redirects to Google; user returns to /api/auth/google/callback. */
export const googleRedirect = async (req: Request, res: Response, next: NextFunction) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return next(new AppError('Google OAuth is not configured', 503));
  }
  try {
    const url = googleOAuth2Client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      access_type: 'offline',
      prompt: 'consent',
    });
    res.redirect(302, url);
  } catch (error) {
    console.error('Google redirect error:', error);
    next(new AppError('Google sign-in failed', 500));
  }
};

/** GET /api/auth/google/callback — Google redirects here with ?code=. Exchange code, create session, redirect to frontend. */
export const googleCallback = async (req: Request, res: Response, next: NextFunction) => {
  const { code, error: oauthError } = req.query as { code?: string; error?: string };
  if (oauthError) {
    const frontend = env.APP_URL.replace(/\/$/, '');
    return res.redirect(302, `${frontend}/login?error=google_denied`);
  }
  if (!code) return next(new AppError('Missing authorization code', 400));

  try {
    const { tokens } = await googleOAuth2Client.getToken(code);
    const idToken = tokens.id_token;
    if (!idToken) return next(new AppError('No ID token from Google', 400));

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return next(new AppError('Invalid Google Token', 400));

    const user = await findOrCreateGoogleUser({
      email: payload.email,
      name: payload.name ?? undefined,
      picture: payload.picture ?? undefined,
      sub: payload.sub,
    });

    const jwtToken = jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
    setAuthCookie(res, jwtToken);

    const frontend = env.APP_URL.replace(/\/$/, '');
    res.redirect(302, `${frontend}/dashboard`);
  } catch (err) {
    console.error('Google callback error:', err);
    next(new AppError('Google sign-in failed', 401));
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.auth_token;

  try {
    // Clear the auth cookie
    res.clearCookie('auth_token');

    if (!token) {
      return res.status(200).json({ status: 'success', message: 'Logged out successfully' });
    }

    // 1. Decode to get expiration time
    const decoded = jwt.decode(token) as any;
    
    // If token is already invalid/malformed, just return success
    if (!decoded || !decoded.exp) {
       return res.status(200).json({ status: 'success', message: 'Logged out successfully' });
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

// Session validation endpoint
export const getMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userResult = await pool.query(
      'SELECT id, email, name, avatar_url, created_at FROM users WHERE id = $1',
      [req.user?.userId]
    );

    if (!userResult.rowCount) {
      return next(new AppError('User not found', 404));
    }

    const user = userResult.rows[0];
    const avatar_url = await toPresignedAssetUrl(user.avatar_url, 604800);
    res.status(200).json({
      status: 'success',
      data: { user: { ...user, avatar_url } }
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/auth/me — Delete account (user must enter their email to confirm)
export const deleteMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.auth_token;
  const { confirmEmail } = req.body as { confirmEmail?: string };

  try {
    const userId = req.user?.userId;
    if (!userId) {
      return next(new AppError('Unauthorized', 401));
    }

    const userResult = await pool.query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    );
    if (!userResult.rowCount) {
      return next(new AppError('User not found', 404));
    }

    const email = userResult.rows[0].email;
    const trimmed = typeof confirmEmail === 'string' ? confirmEmail.trim() : '';
    if (!isValidEmailFormat(trimmed)) {
      return next(new AppError('Please enter a valid email address.', 400));
    }
    if (trimmed.toLowerCase() !== email.toLowerCase()) {
      return next(new AppError('Email does not match. Type your account email to confirm deletion.', 400));
    }

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    res.clearCookie('auth_token');

    if (token) {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.setex(`blacklist:${token}`, ttl, 'true');
        }
      }
    }

    res.status(200).json({ status: 'success', message: 'Account deleted' });
  } catch (error) {
    next(error);
  }
};