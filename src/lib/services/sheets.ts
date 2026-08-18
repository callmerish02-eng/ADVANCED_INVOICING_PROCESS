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

function getServiceAccount(): { client_email: string; private_key: string } | null {
  if (!SA_JSON) return null;
  try {
    return JSON.parse(SA_JSON);
  } catch (err) {
    console.error('[sheets] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:', err);
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON');
  }
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

export async function appendInvoiceRows(rows: InvoiceRow[]): Promise<{
  appendedCount: number;
  updatedRange?: string;
}> {
  if (!SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is not set');
  }
  const sheets = await getSheetsClient();

  // Build the values matrix in the exact column order expected by the sheet.
  const values = rows.map((row) =>
    SHEET_COLUMN_ORDER.map((col) => (row[col] ?? '').toString()),
  );

  const resp = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${INVOICE_TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values,
    },
  });

  return {
    appendedCount: resp.data.updates?.updatedRows ?? rows.length,
    updatedRange: resp.data.updates?.updatedRange ?? undefined,
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
