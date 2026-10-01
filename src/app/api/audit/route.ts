import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/session';
import { readAudit } from '@/lib/db/repositories';
import { decryptString } from '@/lib/security/crypto';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

  const entries = await readAudit(limit);
  // Decrypt details for display to the authenticated admin
  const decoded = entries.map((e) => {
    let details: Record<string, unknown> = {};
    try {
      details = JSON.parse(decryptString(e.detailsEnc) || '{}');
    } catch {
      details = { raw: '' };
    }
    return {
      action: e.action,
      actor: e.actor,
      ip: e.ip,
      userAgent: e.userAgent,
      success: e.success,
      createdAt: e.createdAt,
      details,
    };
  });
  return NextResponse.json({ entries: decoded });
}



