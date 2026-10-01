/**
 * POST /api/sites/seed
 *
 * Append one or more Master Site rows to the SitesList tab of the
 * Google Sheet. If a site with the same HANA Name already exists,
 * we UPDATE the row in place instead of duplicating it.
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/session';
import { writeAudit } from '@/lib/db/repositories';
import { seedSiteSchema } from '@/lib/validation/schemas';
import {
  appendSites,
  findSiteByHanaName,
  updateSiteRow,
} from '@/lib/services/sheets';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const arr = Array.isArray(body) ? body : [body];
  const parsed = arr.map((item) => seedSiteSchema.safeParse(item));
  const failures = parsed.filter((p) => !p.success);
  if (failures.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', details: failures.map((f) => f.error?.flatten()) },
      { status: 400 },
    );
  }

  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const p of parsed) {
    if (!p.success) continue;
    const site = p.data;
    try {
      // Check if HANA Name already exists → update in place, else append
      const existing = await findSiteByHanaName(site.hanaName);
      if (existing) {
        await updateSiteRow(existing.rowIndex, site);
        updated += 1;
      } else {
        await appendSites([site]);
        inserted += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`${site.hanaName}: ${msg}`);
    }
  }

  await writeAudit('SITE_SEED', session.sub, {
    inserted,
    updated,
    errorCount: errors.length,
  });

  return NextResponse.json({ ok: true, inserted, updated, errors });
}



