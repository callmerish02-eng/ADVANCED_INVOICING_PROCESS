/**
 * POST /api/extract
 *
 * Accepts multipart/form-data with one or more files under the `files` field.
 * Each file is sent to Gemini for extraction; results are returned in the
 * same order as the input files.
 *
 * Security:
 * - Auth enforced by middleware
 * - File size limit: 10 MB per file (enforced here)
 * - Allowed MIME types: PDF, PNG, JPEG, WEBP
 * - All actions are audit-logged
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/session';
import { writeAudit } from '@/lib/db/repositories';
import { extractInvoice, suggestExpenseHead } from '@/lib/services/gemini';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 20;
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = rateLimit(`extract:${session.sub}`, 20);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many extraction requests. Please wait a minute.' },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files. Maximum ${MAX_FILES} per request.` },
      { status: 400 },
    );
  }

  const results = [];
  for (const file of files) {
    if (!ALLOWED.has(file.type)) {
      results.push({
        filename: file.name,
        status: 'error',
        error: `Unsupported file type: ${file.type || 'unknown'}`,
      });
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      results.push({
        filename: file.name,
        status: 'error',
        error: `File too large (max 10 MB)`,
      });
      continue;
    }

    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const base64 = buf.toString('base64');
      const extracted = await extractInvoice({
        mimeType: file.type,
        base64Data: base64,
      });
      results.push({
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        status: 'done',
        extracted,
        suggestedExpenseHead: suggestExpenseHead(extracted.expensesDescription || ''),
        dataUrl: `data:${file.type};base64,${base64}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      results.push({
        filename: file.name,
        status: 'error',
        error: message,
      });
    }
  }

  const successCount = results.filter((r) => r.status === 'done').length;
  await writeAudit('EXTRACT', session.sub, {
    fileCount: files.length,
    successCount,
    failCount: files.length - successCount,
  });

  return NextResponse.json({ results });
}
