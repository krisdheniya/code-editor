// ============================================================================
// AuthService — User registration, login, and JWT management
// ============================================================================

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../db/client';
import { config } from '../config';
import { User, JwtPayload } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('auth-service');

const SALT_ROUNDS = 12;

/**
 * Register a new user. Returns the created user (without password hash).
 */
export async function registerUser(email: string, password: string): Promise<Omit<User, 'passwordHash'>> {
  // Check if user already exists
  const existing = await queryOne<User>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    throw new AuthError('Email already registered', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await queryOne<User>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
    [email, passwordHash]
  );

  if (!user) throw new Error('Failed to create user');

  log.info({ userId: user.id, email }, 'User registered');
  return { id: user.id, email: user.email, createdAt: (user as any).created_at } as any;
}

/**
 * Authenticate a user with email/password. Returns a JWT on success.
 */
export async function loginUser(email: string, password: string): Promise<{ token: string; user: { id: string; email: string } }> {
  const user = await queryOne<{ id: string; email: string; password_hash: string }>(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email]
  );

  if (!user) {
    throw new AuthError('Invalid email or password', 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AuthError('Invalid email or password', 401);
  }

  const token = generateToken({ userId: user.id, email: user.email });

  log.info({ userId: user.id }, 'User logged in');
  return { token, user: { id: user.id, email: user.email } };
}

/**
 * Verify a JWT and return the payload.
 */
export function verifyToken(token: string): JwtPayload {
  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    return payload;
  } catch {
    throw new AuthError('Invalid or expired token', 401);
  }
}

/**
 * Generate a JWT for a given payload.
 */
function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiry,
  } as jwt.SignOptions);
}

/**
 * Get user by ID.
 */
export async function getUserById(id: string): Promise<Omit<User, 'passwordHash'> | null> {
  const user = await queryOne<{ id: string; email: string; created_at: Date }>(
    'SELECT id, email, created_at FROM users WHERE id = $1',
    [id]
  );
  if (!user) return null;
  return { id: user.id, email: user.email, createdAt: user.created_at } as any;
}

/**
 * Custom error class for auth-related errors with HTTP status codes.
 */
export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}
