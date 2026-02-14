import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { env } from '../config/env';
import { AppError } from '../utils/appError';
import { User, SafeUser } from '../types';
import { RegisterInput, LoginInput } from '../schemas/auth.schema';
import { isDisposableEmail } from '../utils/emailValidation';

export class AuthService {
  static async register(input: RegisterInput): Promise<{ user: SafeUser; token: string }> {
    const { email, password, name } = input;

    if (isDisposableEmail(email)) {
      throw new AppError('Please use a permanent email address. Disposable or temporary email addresses are not allowed.', 400);
    }

    // Check for duplicate email
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rowCount && existingUser.rowCount > 0) {
      throw new AppError('Email already in use', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query<User>(
      `INSERT INTO users (email, password_hash, name) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, name, created_at`,
      [email, hashedPassword, name]
    );

    const newUser = result.rows[0];
    const token = jwt.sign({ userId: newUser.id, email: newUser.email }, env.JWT_SECRET, { expiresIn: '7d' });

    const safeUser: SafeUser = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      created_at: newUser.created_at
    };

    return { user: safeUser, token };
  }

  static async login(input: LoginInput): Promise<{ user: SafeUser; token: string }> {
    const result = await pool.query<User>('SELECT * FROM users WHERE email = $1', [input.email]);
    const user = result.rows[0];

    // FIX LOGIC:
    // 1. Check if user exists (!user)
    // 2. Check if user has a password (!user.password_hash) <-- Handles Google-only users
    // 3. Compare password
    
    // We assign strict boolean to avoid TS screaming
    const hasPassword = user && user.password_hash;
    const isValid = hasPassword && (await bcrypt.compare(input.password, user.password_hash!)); // Force unwrap ! because we checked hasPassword

    if (!user || !hasPassword || !isValid) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: '7d' });

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url, // Include avatar now
      created_at: user.created_at
    };

    return { user: safeUser, token };
  }
}