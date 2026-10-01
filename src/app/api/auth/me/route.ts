import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/session';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: { username: session.sub, role: session.role },
  });
}



