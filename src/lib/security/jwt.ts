import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const SESSION_COOKIE_NAME = 'inv_session';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me-at-least-32-chars';

export interface SessionPayload {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
}

export function signToken(username: string, role = 'admin'): string {
  return jwt.sign({ sub: username, role }, JWT_SECRET, { expiresIn: '8h' });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  if (username !== adminUser) return false;

  const plain = process.env.ADMIN_PASSWORD_PLAIN;
  if (plain && password === plain) {
    return true;
  }

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash) {
    return bcrypt.compareSync(password, hash);
  }

  return false;
}
