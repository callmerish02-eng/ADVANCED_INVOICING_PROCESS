/**
 * Audit log persistence layer (MongoDB).
 *
 * Master Site Data has moved to the Google Sheets `SitesList` tab — see
 * `src/lib/services/sheets.ts` for readSites / appendSites / findSiteByHanaName.
 *
 * This module ONLY handles audit log entries. All sensitive details are
 * encrypted with AES-256 before being written, so even if MongoDB is
 * compromised, an attacker without ENCRYPTION_KEY cannot read action details.
 */
import { Db } from 'mongodb';
import { getDb } from './mongo';
import { encryptString } from '@/lib/security/crypto';

// Re-export MasterSite from types so callers have a single import path
export type { MasterSite } from '@/lib/types/invoice';

export interface AuditEntry {
  action: string; // LOGIN_OK / LOGIN_FAIL / EXTRACT / SHEETS_PUSH / SITE_SEED / LOGOUT
  actor: string; // username (or 'anonymous')
  ip?: string;
  userAgent?: string;
  // Encrypted blob with action-specific details
  detailsEnc: string;
  success: boolean;
  createdAt: Date;
}

export async function writeAudit(
  action: string,
  actor: string,
  details: Record<string, unknown>,
  opts: { success?: boolean; ip?: string; userAgent?: string } = {},
): Promise<void> {
  let db: Db | null = null;
  try {
    db = await getDb();
  } catch (err) {
    // MongoDB unreachable — fall back to stdout logging so the calling
    // request does not fail just because audit persistence is unavailable.
    console.error('[audit-mongo-unreachable]', err);
  }
  if (!db) {
    console.info(
      '[audit-fallback]',
      action,
      actor,
      JSON.stringify({ ...details, success: opts.success ?? true }),
    );
    return;
  }
  const entry: AuditEntry = {
    action,
    actor,
    ip: opts.ip,
    userAgent: opts.userAgent,
    detailsEnc: encryptString(JSON.stringify(details)),
    success: opts.success ?? true,
    createdAt: new Date(),
  };
  try {
    await db.collection('audit_logs').insertOne(entry);
  } catch (err) {
    console.error('[audit-write-failed]', err);
  }
}

export async function readAudit(limit = 50): Promise<AuditEntry[]> {
  let db: Db | null = null;
  try {
    db = await getDb();
  } catch {
    return [];
  }
  if (!db) return [];
  try {
    const rows = await db
      .collection<AuditEntry>('audit_logs')
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return rows;
  } catch (err) {
    console.error('[audit-read-failed]', err);
    return [];
  }
}
