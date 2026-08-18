/**
 * Google Sheets integration via the googleapis SDK.
 *
 * Authenticates with a service account (JSON provided via env var
 * GOOGLE_SERVICE_ACCOUNT_JSON). The service account must have edit access
 * to the spreadsheet identified by GOOGLE_SHEET_ID.
 *
 * TWO tabs are used as database tables in the same spreadsheet:
 *   1. SitesList  — Master Site Data (17 columns)
 *   2. MasterData — Master Invoice Data (25 columns, append-only)
 *
 * Both tabs are read/written via the same sheets_v4 client.
 */
import { google, sheets_v4 } from 'googleapis';
import {
  SHEET_COLUMN_ORDER,
  InvoiceRow,
  SITE_SHEET_COLUMN_ORDER,
  SITE_SHEET_HEADERS,
  MasterSite,
} from '@/lib/types/invoice';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const INVOICE_TAB = process.env.GOOGLE_SHEET_TAB || 'MasterData';
const SITES_TAB = process.env.SITES_SHEET_TAB || 'SitesList';
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

let cachedClient: sheets_v4.Sheets | null = null;

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

function getServiceAccount(): ServiceAccount | null {
  if (!SA_JSON) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(SA_JSON);
  } catch (err) {
    console.error('[sheets] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:', err);
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Make sure you pasted the entire key file (minified, with all quotes and braces intact).',
    );
  }

  const sa = parsed as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_JSON is missing required fields. Found: ${
        sa.client_email ? 'client_email OK' : 'client_email MISSING'
      }, ${sa.private_key ? 'private_key OK' : 'private_key MISSING'}. ` +
        `Make sure you downloaded a SERVICE ACCOUNT KEY JSON (not an API key, not an OAuth client ID). ` +
        `See https://developers.google.com/identity/protocols/oauth2/service-account#creatinganaccount for steps.`,
    );
  }

  // Sanity-check the private key looks like a PEM (long, contains 'PRIVATE KEY')
  if (sa.private_key.length < 100 || !sa.private_key.includes('PRIVATE KEY')) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON.private_key does not look like a valid PEM key. ' +
        'You may have pasted an API key instead of a service account key JSON.',
    );
  }

  return sa as ServiceAccount;
}

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (cachedClient) return cachedClient;
  const sa = getServiceAccount();
  if (!sa) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is not set. Configure it in the environment.',
    );
  }

  const jwtClient = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  await jwtClient.authorize();
  cachedClient = google.sheets({ version: 'v4', auth: jwtClient });
  return cachedClient;
}

// ─── INVOICE DATA (MasterData tab) ─────────────────────────────────────────

/**
 * The list of (column-letter, InvoiceRow-field) pairs that we actually write
 * to. Any column NOT in this list is left untouched — this preserves
 * formulas in auto-populated columns like "Amount (inclusive of GST)" (=L+M)
 * and any other downstream formulas the user has set up.
 *
 * Column letters are 1-indexed: A=1, B=2, ..., Y=25.
 *
 * We only write to:
 *   A  = FY
 *   B  = Month
 *   E  = Cost Center Description (HANA Name)
 *   G  = Expenses Head
 *   H  = Expenses Description
 *   J  = Vendor Name
 *   K  = Invoice / PO No.
 *   L  = Amount
 *   M  = GST
 *   W  = Document Type
 */
const INVOICE_CELL_MAP: ReadonlyArray<{ col: string; field: keyof InvoiceRow }> = [
  { col: 'A', field: 'FY' },
  { col: 'B', field: 'Month' },
  { col: 'E', field: 'Cost Center Description (HANA Name)' },
  { col: 'G', field: 'Expenses Head' },
  { col: 'H', field: 'Expenses Description' },
  { col: 'J', field: 'Vendor Name' },
  { col: 'K', field: 'Invoice / PO No.' },
  { col: 'L', field: 'Amount' },
  { col: 'M', field: 'GST' },
  { col: 'W', field: 'Document Type' },
];

/**
 * Write invoice rows to the MasterData tab by FILLING EXISTING ROWS where
 * column E is empty. NEVER creates new rows — the sheet has formulas and
 * pre-formatted rows that must not be disturbed.
 *
 * Algorithm:
 *   1. Read all existing data from MasterData!A2:Y
 *   2. Find rows where column E is empty BUT the row has data in other
 *      columns (so we don't fill trailing blank rows)
 *   3. For each invoice, fill the next available empty row using
 *      `spreadsheets.values.batchUpdate` with individual cell ranges
 *      (so formulas in other columns are preserved)
 *   4. If there aren't enough empty rows, throw an error — the user must
 *      add more template rows to the sheet first
 */
export async function appendInvoiceRows(rows: InvoiceRow[]): Promise<{
  appendedCount: number;
  updatedRange?: string;
  filledRows?: number[];
}> {
  if (!SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is not set');
  }
  const sheets = await getSheetsClient();

  // Read existing data to find empty rows
  const readResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${INVOICE_TAB}!A2:Y`,
  });
  const existing = (readResp.data.values as string[][]) ?? [];

  // Find empty row indices (column E empty AND row has SOME data —
  // we don't want to fill trailing fully-blank rows that the sheet
  // uses as buffer)
  const emptyRowIndices: number[] = [];
  for (let i = 0; i < existing.length; i++) {
    const row = existing[i] ?? [];
    const colE = (row[4] ?? '').toString().trim(); // index 4 = column E
    const hasAnyData = row.some((c) => (c ?? '').toString().trim() !== '');
    if (!colE && hasAnyData) {
      emptyRowIndices.push(i + 2); // sheet row number (1-indexed, +1 for header)
    }
  }

  if (emptyRowIndices.length < rows.length) {
    const needed = rows.length - emptyRowIndices.length;
    throw new Error(
      `Not enough empty rows in the MasterData sheet. Need ${rows.length} rows but only ${emptyRowIndices.length} available ` +
        `(column E empty in existing rows). Please add ${needed} more template row(s) to the sheet first — ` +
        `the app will not create new rows because the sheet has formulas that must be preserved.`,
    );
  }

  // For each invoice row, write to the next available empty slot using
  // batchUpdate with individual cell ranges (preserves formulas in other cells)
  const filledRows: number[] = [];
  const allUpdates: sheets_v4.Schema$ValueRange[] = [];

  for (const row of rows) {
    const targetRow = emptyRowIndices.shift()!;
    for (const { col, field } of INVOICE_CELL_MAP) {
      allUpdates.push({
        range: `${INVOICE_TAB}!${col}${targetRow}`,
        values: [[(row[field] ?? '').toString()]],
      });
    }
    filledRows.push(targetRow);
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: allUpdates,
    },
  });

  const minRow = Math.min(...filledRows);
  const maxRow = Math.max(...filledRows);
  return {
    appendedCount: rows.length,
    updatedRange: `${INVOICE_TAB}!A${minRow}:Y${maxRow}`,
    filledRows,
  };
}

/**
 * Read the header row from MasterData — useful for verifying the sheet
 * is reachable and the column order matches our InvoiceRow schema.
 */
export async function readSheetHeader(): Promise<string[]> {
  if (!SHEET_ID) return [];
  const sheets = await getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${INVOICE_TAB}!A1:Z1`,
  });
  return (resp.data.values?.[0] as string[]) ?? [];
}

// ─── MASTER SITE DATA (SitesList tab) ──────────────────────────────────────

/**
 * Read all rows from the SitesList tab. Assumes row 1 is the header
 * (matches SITE_SHEET_HEADERS) and rows 2+ are site records.
 *
 * Returns an empty array if the tab is empty or unreachable.
 */
export async function readSites(): Promise<MasterSite[]> {
  if (!SHEET_ID) return [];
  const sheets = await getSheetsClient();

  // Read columns A through Q (17 columns) — that's the full SITE_SHEET_HEADERS set
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SITES_TAB}!A2:Q`,
  });

  const rows = resp.data.values as string[][] | undefined;
  if (!rows || rows.length === 0) return [];

  const sites: MasterSite[] = [];
  for (const row of rows) {
    // Skip fully-empty rows
    if (!row || row.every((c) => !c || !c.trim())) continue;

    const site: Partial<MasterSite> = {};
    SITE_SHEET_COLUMN_ORDER.forEach((col, idx) => {
      site[col] = (row[idx] ?? '').toString().trim();
    });
    // Skip rows that don't have at least entity + hanaName
    if (!site.entity && !site.hanaName) continue;
    sites.push(site as MasterSite);
  }
  return sites;
}

/**
 * Append one or more site rows to the SitesList tab.
 * If the tab is empty (no header), we first write the header row.
 *
 * NOTE: This is APPEND-only — if a site with the same HANA Name already
 * exists, it will be duplicated. Use `findDuplicateSite()` to check
 * before calling this.
 */
export async function appendSites(sites: MasterSite[]): Promise<{
  appendedCount: number;
  updatedRange?: string;
}> {
  if (!SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is not set');
  }
  const sheets = await getSheetsClient();

  // Build the values matrix
  const values = sites.map((site) =>
    SITE_SHEET_COLUMN_ORDER.map((col) => (site[col] ?? '').toString()),
  );

  // Ensure the header row exists (read first, then write if missing)
  try {
    const headerResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SITES_TAB}!A1:Q1`,
    });
    const header = headerResp.data.values?.[0] as string[] | undefined;
    if (!header || header.length === 0 || header.every((c) => !c)) {
      // No header — write one first
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SITES_TAB}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [SITE_SHEET_HEADERS as string[]] },
      });
    }
  } catch (err) {
    // The tab name may not exist yet — log and continue, the append may
    // auto-create it depending on the sheet's settings.
    console.warn('[sheets] SitesList tab header check failed:', err);
  }

  const resp = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SITES_TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });

  return {
    appendedCount: resp.data.updates?.updatedRows ?? sites.length,
    updatedRange: resp.data.updates?.updatedRange ?? undefined,
  };
}

/**
 * Update a single site row in-place by 1-based row index.
 * Used by the upsert flow when a duplicate HANA Name is found.
 */
export async function updateSiteRow(
  rowIndex: number, // 1-based, including header (so row 2 is the first data row)
  site: MasterSite,
): Promise<void> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set');
  const sheets = await getSheetsClient();
  const values = [SITE_SHEET_COLUMN_ORDER.map((col) => (site[col] ?? '').toString())];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SITES_TAB}!A${rowIndex}:Q${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

/**
 * Find a site by HANA Name (case-insensitive). Returns the 1-based row
 * index (including header) and the site, or null if not found.
 */
export async function findSiteByHanaName(
  hanaName: string,
): Promise<{ rowIndex: number; site: MasterSite } | null> {
  if (!SHEET_ID) return null;
  const sheets = await getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SITES_TAB}!A2:Q`,
  });
  const rows = (resp.data.values as string[][]) ?? [];
  const target = hanaName.toLowerCase().trim();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c || !c.trim())) continue;
    // hanaName is column M (index 12)
    const cellHana = (row[12] ?? '').toString().toLowerCase().trim();
    if (cellHana === target) {
      const site: Partial<MasterSite> = {};
      SITE_SHEET_COLUMN_ORDER.forEach((col, idx) => {
        site[col] = (row[idx] ?? '').toString().trim();
      });
      return { rowIndex: i + 2, site: site as MasterSite }; // +2 because: 1 header + 1-based
    }
  }
  return null;
}

// ─── SHARED ────────────────────────────────────────────────────────────────

export const SHEETS_ENABLED = !!SHEET_ID && !!SA_JSON;
