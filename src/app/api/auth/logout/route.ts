import { NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/security/session';
import { writeAudit } from '@/lib/db/repositories';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getSession();
  if (session?.sub) {
    await writeAudit('LOGOUT', session.sub, {});
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}



