import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/session';
import { writeAudit } from '@/lib/db/repositories';
import { pushToSheetsSchema } from '@/lib/validation/schemas';
import { appendInvoiceRows, readSites } from '@/lib/services/sheets';
import { uploadInvoiceToFolder } from '@/lib/services/drive';
import { getAuthorizedClient } from '@/lib/services/sheets-service-account';
import { google } from 'googleapis';
import { InvoiceRow } from '@/lib/types/invoice';

export const runtime = 'nodejs';

function currentFY(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m <= 3) return `${y - 1}-${String(y).slice(-2)}`;
  return `${y}-${String(y + 1).slice(-2)}`;
}

function fyFromDate(dateStr: string): string {
  if (!dateStr) return currentFY();
  const m = dateStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return currentFY();
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month >= 1 && month <= 12) {
    if (month <= 3) return `${year - 1}-${String(year).slice(-2)}`;
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return currentFY();
}

function currentMonthAbbr(): string {
  return new Date().toLocaleString('en-US', { month: 'short' });
}

function monthAbbrFromDate(dateStr: string): string {
  if (!dateStr) return currentMonthAbbr();
  const m = dateStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return currentMonthAbbr();
  const month = parseInt(m[2], 10);
  if (month >= 1 && month <= 12) {
    const date = new Date(2000, month - 1, 1);
    return date.toLocaleString('en-US', { month: 'short' });
  }
  return currentMonthAbbr();
}

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

  const parsed = pushToSheetsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const invoiceNumbersToCheck = parsed.data.rows
    .map((r) => r.invoiceNumber?.trim())
    .filter(Boolean) as string[];

  if (invoiceNumbersToCheck.length > 0 && !parsed.data.force) {
    try {
      const auth = await getAuthorizedClient();
      const sheetsApi = google.sheets({ version: 'v4', auth });
      const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
      const INVOICE_TAB = process.env.GOOGLE_SHEET_TAB || 'MasterData';

      const resp = await sheetsApi.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${INVOICE_TAB}!K2:K`,
      });
      const existingRows = (resp.data.values as string[][]) ?? [];

      const existingSet = new Set<string>();
      for (const row of existingRows) {
        const v = (row?.[0] ?? '').toString().trim().toLowerCase();
        if (v) existingSet.add(v);
      }

      const duplicates = invoiceNumbersToCheck.filter((inv) =>
        existingSet.has(inv.toLowerCase()),
      );

      if (duplicates.length > 0) {
        await writeAudit('SHEETS_PUSH_DUPLICATE_FOUND', session.sub, {
          duplicates,
          rowCount: parsed.data.rows.length,
        });
        return NextResponse.json(
          {
            error: 'duplicates_found',
            duplicates,
            message: `${duplicates.length} invoice(s) with the same number already exist in the sheet. Drop them or proceed anyway?`,
          },
          { status: 409 },
        );
      }
    } catch (err) {
      console.error('[push] Duplicate check notice:', err);
    }
  }

  const sites = await readSites();
  const siteByHana = new Map(sites.map((s) => [s.hanaName.toLowerCase(), s]));

  const rows: InvoiceRow[] = parsed.data.rows.map((r) => {
    const amount = parseFloat(r.amount) || 0;
    const gst = parseFloat(r.gst) || 0;
    const fy = r.fy || fyFromDate(r.invoiceDate || '');
    const month = r.month || monthAbbrFromDate(r.invoiceDate || '');
    const site = siteByHana.get((r.hanaName || '').toLowerCase());
    const vendorName = site?.vendorName ?? r.vendorName ?? '';
    const legalEntity = r.entity || site?.entity || '';

    return {
      FY: fy,
      Month: month,
      '4D Print': '',
      'Legal Entity': legalEntity,
      'Cost Center Description (HANA Name)': r.hanaName,
      'Cost Center Code': site?.costCenter || '',
      'Expenses Head': r.expensesHead,
      'Expenses Description': r.expensesDescription || '',
      'Vendor Code': site?.vendorCode || '',
      'Vendor Name': vendorName,
      'Invoice / PO No.': r.invoiceNumber || '',
      Amount: amount.toFixed(2),
      GST: gst.toFixed(2),
      'Amount (inclusive of GST)': '',
      'Email address of inputer': '',
      PO: '',
      SES: '',
      'SES Date': '',
      'SES Remarks': '',
      'Mail Status': '',
      'Mail Sent On': '',
      SIte: site?.tag || '',
      'Document Type': r.documentType || 'Tax Invoice',
      'Payment Date': '',
      'UTR Details': '',
    };
  });

  try {
    const result = await appendInvoiceRows(rows);
    await writeAudit('SHEETS_PUSH', session.sub, {
      rowCount: rows.length,
      appendedCount: result.appendedCount,
      range: result.updatedRange,
      filledRows: result.filledRows,
    });

    const driveResults: Array<{ filename: string; ok: boolean; url?: string; error?: string }> = [];
    for (const r of parsed.data.rows) {
      if (!r.fileData || !r.filename) {
        driveResults.push({ filename: r.filename || '(no file)', ok: false, error: 'no file data' });
        continue;
      }
      try {
        const fy = r.fy || fyFromDate(r.invoiceDate || '');
        const month = r.month || monthAbbrFromDate(r.invoiceDate || '');
        const driveResult = await uploadInvoiceToFolder({
          fy,
          month,
          filename: r.filename,
          mimeType: r.mimeType || 'application/octet-stream',
          base64Data: r.fileData,
        });
        driveResults.push({
          filename: r.filename,
          ok: true,
          url: driveResult.fileUrl,
        });
      } catch (err: any) {
        driveResults.push({
          filename: r.filename,
          ok: false,
          error: err.message || 'Drive upload failed',
        });
      }
    }

    return NextResponse.json({
      ok: true,
      pushed: result.appendedCount,
      range: result.updatedRange,
      filledRows: result.filledRows,
      drive: driveResults,
    });
  } catch (err: any) {
    const message = err.message || 'Unknown error';
    await writeAudit(
      'SHEETS_PUSH',
      session.sub,
      { rowCount: rows.length, error: message },
      { success: false },
    );
    return NextResponse.json(
      { error: 'Failed to push to Google Sheets', details: message },
      { status: 500 },
    );
  }
}
