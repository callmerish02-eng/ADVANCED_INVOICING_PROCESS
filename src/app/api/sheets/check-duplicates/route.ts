/**
 * POST /api/sheets/check-duplicates
 *
 * Accepts an array of invoice numbers and returns which ones already exist
 * in the MasterData sheet (column K = "Invoice / PO No.").
 *
 * Used by the UI before pushing — if duplicates are found, a confirmation
 * dialog is shown with "Drop duplicates" or "Proceed anyway" options.
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/session';
import { google } from 'googleapis';
import { getAuthorizedClient } from '@/lib/services/sheets-service-account';

export const runtime = 'nodejs';

interface DuplicateHit {
  invoiceNumber: string;
  rowIndex: number; // 1-based sheet row number
  existingVendorName: string;
  existingAmount: string;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const INVOICE_TAB = process.env.GOOGLE_SHEET_TAB || 'MasterData';
  if (!SHEET_ID) {
    return NextResponse.json({ error: 'GOOGLE_SHEET_ID not set' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { invoiceNumbers } = body as { invoiceNumbers?: string[] };
  if (!Array.isArray(invoiceNumbers)) {
    return NextResponse.json(
      { error: 'invoiceNumbers must be an array of strings' },
      { status: 400 },
    );
  }

  // Filter out empty strings
  const toCheck = invoiceNumbers.map((s) => s?.trim()).filter(Boolean);
  if (toCheck.length === 0) {
    return NextResponse.json({ duplicates: [] });
  }

  try {
    const auth = await getAuthorizedClient();
    const sheets = google.sheets({ version: 'v4', auth });

    // Read columns J through L (vendor name, invoice number, amount) of
    // all rows. J=10, K=11, L=12 → range J2:L
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${INVOICE_TAB}!J2:L`,
    });
    const rows = (resp.data.values as string[][]) ?? [];

    // Build a map: lowercase invoice number → first row index where it appears
    // (column K = index 1 in our J:L range)
    const existingMap = new Map<string, { rowIndex: number; vendor: string; amount: string }>();
    for (let i = 0; i < rows.length; i++) {
      const invNo = (rows[i]?.[1] ?? '').toString().trim();
      if (!invNo) continue;
      const key = invNo.toLowerCase();
      if (!existingMap.has(key)) {
        existingMap.set(key, {
          rowIndex: i + 2, // 1-based + header row
          vendor: (rows[i]?.[0] ?? '').toString().trim(),
          amount: (rows[i]?.[2] ?? '').toString().trim(),
        });
      }
    }

    const duplicates: DuplicateHit[] = [];
    for (const invNo of toCheck) {
      const hit = existingMap.get(invNo.toLowerCase());
      if (hit) {
        duplicates.push({
          invoiceNumber: invNo,
          rowIndex: hit.rowIndex,
          existingVendorName: hit.vendor,
          existingAmount: hit.amount,
        });
      }
    }

    return NextResponse.json({ duplicates });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to check duplicates', details: message },
      { status: 500 },
    );
  }
}
