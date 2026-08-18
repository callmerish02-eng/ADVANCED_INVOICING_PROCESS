/**
 * Cookie helpers — only usable inside route handlers and server components
 * (these use next/headers which is not available in middleware).
 */
import { cookies } from 'next/headers';
import {
  signSession,
  verifySession,
  SessionPayload,
  SESSION_COOKIE_NAME,
} from './jwt';

export { signSession, verifySession, SESSION_COOKIE_NAME };
export type { SessionPayload };

export async function getSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = await getSessionCookie();
  if (!token) return null;
  return verifySession(token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
