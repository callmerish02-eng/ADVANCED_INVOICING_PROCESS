import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/session';
import { readSites } from '@/lib/services/sheets';
import { writeAudit } from '@/lib/db/repositories';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const sites = await readSites();
    return NextResponse.json({ sites });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read sites';
    await writeAudit(
      'SITES_READ',
      session.sub,
      { error: message },
      { success: false },
    );
    return NextResponse.json(
      { error: 'Failed to read SitesList tab', details: message },
      { status: 500 },
    );
  }
}



