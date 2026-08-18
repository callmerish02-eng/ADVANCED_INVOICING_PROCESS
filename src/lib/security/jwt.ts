/**
 * JWT signing/verification — no Next.js dependencies so it can be used
 * in middleware, route handlers, and server components alike.
 */
import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { safeEqual } from './crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-replace-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

export interface SessionPayload extends JwtPayload {
  sub: string; // username
  role: 'admin';
}

export function signSession(username: string): string {
  return jwt.sign({ sub: username, role: 'admin' }, JWT_SECRET, {
    expiresIn: EXPIRES_IN,
    algorithm: 'HS256',
  } as jwt.SignOptions);
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function verifyAdminCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  if (!safeEqual(username, expectedUser)) return false;

  const plain = process.env.ADMIN_PASSWORD_PLAIN;
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (hash) {
    return await bcrypt.compare(password, hash);
  }
  if (plain) {
    return safeEqual(password, plain);
  }
  return false;
}

export const SESSION_COOKIE_NAME = process.env.COOKIE_NAME || 'inv_session';
