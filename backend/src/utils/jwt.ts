import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import pool from '../config/db';
import { User, TokenPayload } from '../types';

export const verifyToken = (token: string): Promise<User> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, env.JWT_SECRET, async (err, decoded) => {
      if (err || !decoded) {
        return reject(new Error('Invalid token'));
      }

      const payload = decoded as TokenPayload;

      try {
        // We fetch the FULL user from DB so the Socket has access to name/avatar
        const result = await pool.query<User>(
          'SELECT id, email, name, avatar_url, created_at FROM users WHERE id = $1',
          [payload.userId]
        );

        if (result.rowCount === 0) {
          return reject(new Error('User not found'));
        }

        // Return the full User object (including password_hash if you selected it, but we didn't)
        // We cast to User type because we selected the required fields
        resolve(result.rows[0] as User);
      } catch (dbError) {
        reject(dbError);
      }
    });
  });
};