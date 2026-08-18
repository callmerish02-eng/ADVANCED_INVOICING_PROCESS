/**
 * POST /api/sheets/push
 *
 * Accepts an array of finalized invoice rows (after user review/edit),
 * enriches each with master site data lookups (vendor code, cost center
 * description, FY/Month auto-derived from current date), and appends
 * them as new rows to the MasterData sheet.
 *
 * All A-fields (autopopulated downstream) are sent as empty strings.
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/session';
import { writeAudit } from '@/lib/db/repositories';
import { pushToSheetsSchema } from '@/lib/validation/schemas';
import { appendInvoiceRows, readSites } from '@/lib/services/sheets';
import { InvoiceRow } from '@/lib/types/invoice';

export const runtime = 'nodejs';

function currentFY(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 0-indexed
  // Indian fiscal year: April 1 to March 31
  // If month is Jan-Mar (1-3), FY is (y-1)-(y)
  // If month is Apr-Dec (4-12), FY is y-(y+1)
  if (m <= 3) return `${y - 1}-${y}`;
  return `${y}-${y + 1}`;
}

function currentMonthName(): string {
  return new Date().toLocaleString('en-US', { month: 'long' });
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

  // Load master sites for enrichment (HANA Name → full site record).
  // Sites now live in the SitesList tab of the same Google Sheet.
  const sites = await readSites();
  const siteByHana = new Map(sites.map((s) => [s.hanaName.toLowerCase(), s]));

  const rows: InvoiceRow[] = parsed.data.rows.map((r) => {
    const site = siteByHana.get((r.hanaName || '').toLowerCase());
    const amount = parseFloat(r.amount) || 0;
    const gst = parseFloat(r.gst) || 0;

    return {
      FY: r.fy || currentFY(),
      Month: r.month || currentMonthName(),
      '4D Print': '',
      'Legal Entity': site?.entity ?? '',
      'Cost Center Description (HANA Name)': r.hanaName,
      'Cost Center Code': '',
      'Expenses Head': r.expensesHead,
      'Expenses Description': r.expensesDescription,
      'Vendor Code': '',
      'Vendor Name': r.vendorName,
      'Invoice / PO No.': r.invoiceNumber,
      Amount: amount.toFixed(2),
      GST: gst.toFixed(2),
      'Amount (inclusive of GST)': (amount + gst).toFixed(2),
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
    });
    return NextResponse.json({
      ok: true,
      pushed: result.appendedCount,
      range: result.updatedRange,
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
