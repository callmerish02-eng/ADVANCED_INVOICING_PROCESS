import { Db } from 'mongodb';
import { getDb } from './mongo';
import { encryptString } from '@/lib/security/crypto';

export type { MasterSite } from '@/lib/types/invoice';

export interface AuditEntry {
  action: string;
  actor: string;
  ip?: string;
  userAgent?: string;
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
    await db.collection<AuditEntry>('audit_logs').insertOne(entry);
  } catch (err) {
    console.error('[audit-write-error]', err);
  }
}

export async function readAudit(limit = 50): Promise<AuditEntry[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    return await db
      .collection<AuditEntry>('audit_logs')
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  } catch (err) {
    console.error('[audit-read-error]', err);
    return [];
  }
}
