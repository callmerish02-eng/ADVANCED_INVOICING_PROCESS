/**
 * POST /api/sheets/push
 *
 * Accepts an array of finalized invoice rows (after user review/edit) and:
 *   1. Fills them into EXISTING empty rows in the MasterData sheet (never
 *      creates new rows — preserves sheet formulas). Only specific cells
 *      are written; formulas in other cells remain intact.
 *   2. Uploads the original invoice file to Google Drive in a
 *      FY{YYYY-YY}/{Mon}/ folder structure (best-effort — doesn't fail
 *      the Sheets push if Drive upload fails).
 *
 * Per user spec, only these cells are written per row:
 *   A=FY, B=Month (Jan/Feb/...), E=HANA Name, G=Expenses Head,
 *   H=Expenses Description, J=Vendor Name, K=Invoice No.,
 *   L=Amount, M=GST, W=Document Type.
 * All other columns (Legal Entity, Vendor Code, Amount incl GST, etc.)
 * are left untouched — they're either auto-populated downstream by SAP /
 * mail / payment systems, or contain formulas.
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/session';
import { writeAudit } from '@/lib/db/repositories';
import { pushToSheetsSchema } from '@/lib/validation/schemas';
import { appendInvoiceRows, readSites } from '@/lib/services/sheets';
import { uploadInvoiceToFolder } from '@/lib/services/drive';
import { InvoiceRow } from '@/lib/types/invoice';

export const runtime = 'nodejs';

function currentFY(): string {
  // FY is derived from the invoice date if available, else current date.
  // Indian fiscal year: April 1 to March 31.
  // If month is Jan-Mar (1-3), FY is (y-1)-(y)
  // If month is Apr-Dec (4-12), FY is y-(y+1)
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 0-indexed
  if (m <= 3) return `${y - 1}-${y}`;
  return `${y}-${y + 1}`;
}

function fyFromDate(dateStr: string): string {
  if (!dateStr) return currentFY();
  // Accept DD/MM/YYYY or DD-MM-YYYY
  const m = dateStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return currentFY();
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month >= 1 && month <= 12) {
    if (month <= 3) return `${year - 1}-${year}`;
    return `${year}-${year + 1}`;
  }
  return currentFY();
}

function currentMonthAbbr(): string {
  return new Date().toLocaleString('en-US', { month: 'short' }); // Jan, Feb, Mar
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

  // Look up master sites by HANA Name. The Vendor Name written to the sheet
  // comes from the SitesList tab (the vendor registered for that site), NOT
  // from what was extracted from the invoice. This ensures consistency —
  // the same vendor will always be associated with the same site.
  const sites = await readSites();
  const siteByHana = new Map(sites.map((s) => [s.hanaName.toLowerCase(), s]));

  const rows: InvoiceRow[] = parsed.data.rows.map((r) => {
    const amount = parseFloat(r.amount) || 0;
    const gst = parseFloat(r.gst) || 0;
    // Use invoice date to derive FY + Month (so Drive folder structure
    // matches the invoice's own date, not the current date)
    const fy = r.fy || fyFromDate(r.invoiceDate);
    const month = r.month || monthAbbrFromDate(r.invoiceDate);
    // Vendor Name comes from the master site lookup, not the invoice.
    // If the site doesn't exist in SitesList, we fall back to the invoice's
    // vendor name (best-effort — but the UI should always have a valid site).
    const site = siteByHana.get((r.hanaName || '').toLowerCase());
    const vendorName = site?.vendorName ?? r.vendorName ?? '';

    return {
      FY: fy,
      Month: month,
      '4D Print': '',
      // Legal Entity is left empty per user request — they fill it downstream
      'Legal Entity': '',
      'Cost Center Description (HANA Name)': r.hanaName,
      'Cost Center Code': '',
      'Expenses Head': r.expensesHead,
      'Expenses Description': r.expensesDescription,
      // Vendor Code is left empty per user request — only Vendor Name is written
      'Vendor Code': '',
      'Vendor Name': vendorName,
      'Invoice / PO No.': r.invoiceNumber,
      Amount: amount.toFixed(2),
      GST: gst.toFixed(2),
      // Leave this empty — the sheet has a formula =L+M in this column
      'Amount (inclusive of GST)': '',
      'Email address of inputer': '',
      PO: '',
      SES: '',
      'SES Date': '',
      'SES Remarks': '',
      'Mail Status': '',
      'Mail Sent On': '',
      SIte: '',
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

    // Upload original invoice files to Google Drive in FY/Month folder structure
    // (best-effort — don't fail the whole request if Drive upload fails)
    const driveResults: Array<{ filename: string; ok: boolean; url?: string; error?: string }> = [];
    for (const r of parsed.data.rows) {
      if (!r.fileData || !r.filename) {
        driveResults.push({ filename: r.filename || '(no file)', ok: false, error: 'no file data' });
        continue;
      }
      try {
        const fy = r.fy || fyFromDate(r.invoiceDate);
        const month = r.month || monthAbbrFromDate(r.invoiceDate);
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
      } catch (err) {
        driveResults.push({
          filename: r.filename,
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown error',
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
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
