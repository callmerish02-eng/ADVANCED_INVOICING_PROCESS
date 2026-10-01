/**
 * Google Sheets API v4 integration service.
 * Handles Master Site Data (SitesList tab) and Master Invoice Data (MasterData tab).
 */
import { google } from 'googleapis';
import { getAuthorizedClient } from './sheets-service-account';
import { MasterSite, InvoiceRow, SITE_SHEET_COLUMN_ORDER } from '@/lib/types/invoice';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SITES_TAB = process.env.SITES_SHEET_TAB || 'SitesList';
const INVOICE_TAB = process.env.GOOGLE_SHEET_TAB || 'MasterData';

export const SHEETS_ENABLED = !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SHEET_ID);

export async function getSheetsApi() {
  const auth = await getAuthorizedClient();
  return google.sheets({ version: 'v4', auth });
}

export async function readSites(): Promise<MasterSite[]> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not configured');
  const sheets = await getSheetsApi();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SITES_TAB}!A2:Q`,
  });

  const rows = (res.data.values as string[][]) ?? [];
  return rows.map((r) => ({
    entity: (r[0] || '').trim(),
    status: (r[1] || 'Active').trim(),
    type: (r[2] || '').trim(),
    tag: (r[3] || '').trim(),
    region: (r[4] || '').trim(),
    state: (r[5] || '').trim(),
    address: (r[6] || '').trim(),
    vendorCode: (r[7] || '').trim(),
    vendorName: (r[8] || '').trim(),
    vendorEmail: (r[9] || '').trim(),
    vendorMobile: (r[10] || '').trim(),
    costCenter: (r[11] || '').trim(),
    hanaName: (r[12] || '').trim(),
    businessAreaCode: (r[13] || '').trim(),
    taxCode: (r[14] || '').trim(),
    frequency: (r[15] || 'Monthly').trim(),
    remarks: (r[16] || '').trim(),
  })).filter((s) => s.hanaName);
}

export async function findSiteByHanaName(hanaName: string): Promise<{ rowIndex: number; site: MasterSite } | null> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not configured');
  const sheets = await getSheetsApi();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SITES_TAB}!M2:M`,
  });

  const rows = (res.data.values as string[][]) ?? [];
  const target = hanaName.trim().toLowerCase();

  for (let i = 0; i < rows.length; i++) {
    const val = (rows[i]?.[0] || '').trim().toLowerCase();
    if (val === target) {
      const sites = await readSites();
      const site = sites.find((s) => s.hanaName.toLowerCase() === target);
      if (site) {
        return { rowIndex: i + 2, site };
      }
    }
  }
  return null;
}

export async function updateSiteRow(rowIndex: number, site: MasterSite): Promise<void> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not configured');
  const sheets = await getSheetsApi();

  const rowValues = [
    site.entity,
    site.status || 'Active',
    site.type || '',
    site.tag || '',
    site.region || '',
    site.state || '',
    site.address || '',
    site.vendorCode || '',
    site.vendorName || '',
    site.vendorEmail || '',
    site.vendorMobile || '',
    site.costCenter || '',
    site.hanaName,
    site.businessAreaCode || '',
    site.taxCode || '',
    site.frequency || 'Monthly',
    site.remarks || '',
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SITES_TAB}!A${rowIndex}:Q${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [rowValues] },
  });
}

export async function appendSites(sites: MasterSite[]): Promise<void> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not configured');
  const sheets = await getSheetsApi();

  const rows = sites.map((site) => [
    site.entity,
    site.status || 'Active',
    site.type || '',
    site.tag || '',
    site.region || '',
    site.state || '',
    site.address || '',
    site.vendorCode || '',
    site.vendorName || '',
    site.vendorEmail || '',
    site.vendorMobile || '',
    site.costCenter || '',
    site.hanaName,
    site.businessAreaCode || '',
    site.taxCode || '',
    site.frequency || 'Monthly',
    site.remarks || '',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SITES_TAB}!A2:Q`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

export async function appendInvoiceRows(rows: InvoiceRow[]): Promise<{
  appendedCount: number;
  updatedRange: string;
  filledRows: number[];
}> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not configured');
  const sheets = await getSheetsApi();

  // Read column E (Cost Center Description / HANA Name) to find empty template rows
  const scanRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${INVOICE_TAB}!E2:E`,
  });

  const existingE = (scanRes.data.values as string[][]) ?? [];
  const emptyRowIndices: number[] = [];

  for (let i = 0; i < existingE.length; i++) {
    const val = (existingE[i]?.[0] ?? '').toString().trim();
    if (!val) {
      emptyRowIndices.push(i + 2); // 1-based + 1 for header
    }
  }

  // If there are fewer empty rows than needed, append new rows
  let nextRow = existingE.length + 2;
  while (emptyRowIndices.length < rows.length) {
    emptyRowIndices.push(nextRow++);
  }

  const filledRows: number[] = [];
  const dataUpdates: Array<{ range: string; values: string[][] }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const targetRow = emptyRowIndices[i];
    filledRows.push(targetRow);

    // Write specific cells to preserve formulas in other columns:
    // A=FY, B=Month, D=Legal Entity, E=HANA Name, G=Expense Head, H=Desc,
    // J=Vendor Name, K=Invoice No, L=Amount, M=GST, W=Document Type
    dataUpdates.push(
      { range: `${INVOICE_TAB}!A${targetRow}:B${targetRow}`, values: [[row.FY, row.Month]] },
      { range: `${INVOICE_TAB}!D${targetRow}:E${targetRow}`, values: [[row['Legal Entity'], row['Cost Center Description (HANA Name)']] ] },
      { range: `${INVOICE_TAB}!G${targetRow}:H${targetRow}`, values: [[row['Expenses Head'], row['Expenses Description']]] },
      { range: `${INVOICE_TAB}!J${targetRow}:M${targetRow}`, values: [[row['Vendor Name'], row['Invoice / PO No.'], row.Amount, row.GST]] },
      { range: `${INVOICE_TAB}!W${targetRow}`, values: [[row['Document Type']]] }
    );
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: dataUpdates,
    },
  });

  return {
    appendedCount: rows.length,
    updatedRange: `${INVOICE_TAB}!A${filledRows[0]}:W${filledRows[filledRows.length - 1]}`,
    filledRows,
  };
}
