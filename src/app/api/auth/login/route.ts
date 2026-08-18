import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rate-limit';
import { writeAudit } from '@/lib/db/repositories';
import { loginSchema } from '@/lib/validation/schemas';
import {
  signSession,
  setSessionCookie,
} from '@/lib/security/session';
import { verifyAdminCredentials } from '@/lib/security/jwt';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const ua = req.headers.get('user-agent') || '';

  // Rate limit: 10 attempts per minute per IP
  const rl = rateLimit(`login:${ip}`, 10);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { username, password } = parsed.data;
  const ok = await verifyAdminCredentials(username, password);

  if (!ok) {
    await writeAudit(
      'LOGIN_FAIL',
      username,
      { reason: 'invalid_credentials' },
      { success: false, ip, userAgent: ua },
    );
    return NextResponse.json(
      { error: 'Invalid username or password' },
      { status: 401 },
    );
  }

  const token = signSession(username);
  await setSessionCookie(token);
  await writeAudit('LOGIN_OK', username, {}, { ip, userAgent: ua });

  return NextResponse.json({
    ok: true,
    user: { username },
    expiresInHours: 8,
  });
}
