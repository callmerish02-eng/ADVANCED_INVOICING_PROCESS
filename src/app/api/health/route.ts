import { NextResponse } from 'next/server';
import { MONGO_ENABLED } from '@/lib/db/mongo';
import { SHEETS_ENABLED } from '@/lib/services/sheets';

export const runtime = 'nodejs';

export async function GET() {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasAdminCreds = !!(
    process.env.ADMIN_USERNAME && (process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_PLAIN)
  );
  const hasEncryption = !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 64;
  const hasJwt = !!process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32;

  return NextResponse.json({
    status: 'ok',
    services: {
      mongo: MONGO_ENABLED,
      gemini: hasGemini,
      sheets: SHEETS_ENABLED,
      auth: hasAdminCreds,
      encryption: hasEncryption,
      jwt: hasJwt,
    },
    // Expose missing-config flags so the UI can show setup guidance
    // without leaking secrets.
    missing: [
      !hasGemini ? 'GEMINI_API_KEY' : null,
      !SHEETS_ENABLED ? 'GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEET_ID' : null,
      !hasAdminCreds ? 'ADMIN_USERNAME / ADMIN_PASSWORD_HASH' : null,
      !hasEncryption ? 'ENCRYPTION_KEY' : null,
      !hasJwt ? 'JWT_SECRET' : null,
      !MONGO_ENABLED ? 'MONGO_URI' : null,
    ].filter(Boolean),
  });
}
