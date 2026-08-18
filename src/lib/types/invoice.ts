/**
 * Type definitions for the Master Invoice Data tracker.
 *
 * Fields marked with "A" in the user's spec are auto-populated by downstream
 * systems (SAP, mail, payment) — we leave them empty when pushing to Sheets.
 * Fields the AI must extract are tagged with EXTRACTED.
 * Fields derived from Master Site Data are tagged with LOOKUP.
 * Fields auto-derived from the current date are tagged with AUTO_DATE.
 */

export interface InvoiceRow {
  // AUTO_DATE — derived from invoice date or current month
  FY: string;
  // AUTO_DATE — derived from invoice date or current month
  Month: string;
  // A — autopopulated, leave empty
  '4D Print': string;
  // A — autopopulated, leave empty
  'Legal Entity': string;
  // LOOKUP — from master site data (HANA Name)
  'Cost Center Description (HANA Name)': string;
  // A — autopopulated, leave empty
  'Cost Center Code': string;
  // EXTRACTED — categorisation chosen by user (dropdown)
  'Expenses Head': string;
  // EXTRACTED — description from the invoice
  'Expenses Description': string;
  // A — autopopulated, leave empty (matches vendor name from site data)
  'Vendor Code': string;
  // EXTRACTED — vendor name from the invoice
  'Vendor Name': string;
  // EXTRACTED (optional)
  'Invoice / PO No.': string;
  // EXTRACTED — base amount (excluding GST)
  Amount: string;
  // EXTRACTED — GST amount
  GST: string;
  // A — autopopulated by downstream (computed: Amount + GST)
  'Amount (inclusive of GST)': string;
  // A — autopopulated, leave empty
  'Email address of inputer': string;
  // A — autopopulated, leave empty
  PO: string;
  // A — autopopulated, leave empty
  SES: string;
  // A — autopopulated, leave empty
  'SES Date': string;
  // A — autopopulated, leave empty
  'SES Remarks': string;
  // A — autopopulated, leave empty
  'Mail Status': string;
  // A — autopopulated, leave empty
  'Mail Sent On': string;
  // A — autopopulated, leave empty
  SIte: string;
  // EXTRACTED with default "Tax Invoice"
  'Document Type': string;
  // A — autopopulated, leave empty
  'Payment Date': string;
  // A — autopopulated, leave empty
  'UTR Details': string;
}

/**
 * The order of columns as they appear in the MasterData sheet.
 * This MUST match the sheet's header row order.
 */
export const SHEET_COLUMN_ORDER: readonly (keyof InvoiceRow)[] = [
  'FY',
  'Month',
  '4D Print',
  'Legal Entity',
  'Cost Center Description (HANA Name)',
  'Cost Center Code',
  'Expenses Head',
  'Expenses Description',
  'Vendor Code',
  'Vendor Name',
  'Invoice / PO No.',
  'Amount',
  'GST',
  'Amount (inclusive of GST)',
  'Email address of inputer',
  'PO',
  'SES',
  'SES Date',
  'SES Remarks',
  'Mail Status',
  'Mail Sent On',
  'SIte',
  'Document Type',
  'Payment Date',
  'UTR Details',
];

export interface ExtractedInvoice {
  vendorName: string;
  vendorAddress?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  amount: string;
  gst: string;
  totalAmount?: string;
  documentType: string;
  expensesDescription: string;
  rawText?: string;
}

export interface UploadedFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  dataUrl: string; // base64 data URL for preview / Gemini
  extracted?: ExtractedInvoice;
  extractError?: string;
  status: 'queued' | 'extracting' | 'done' | 'error';
}

/**
 * The set of allowed Expense Heads. Extend as needed.
 */
export const EXPENSE_HEADS = [
  'Rent',
  'Electricity',
  'Water',
  'Internet & Telecom',
  'Housekeeping',
  'Security',
  'Manpower & Staffing',
  'Equipment Maintenance',
  'AMC / CMC',
  'Consumables',
  'Stationery & Printing',
  'Travel & Conveyance',
  'Professional Fees',
  'Repairs & Maintenance',
  'Waste Management',
  'Pantry & Refreshments',
  'Insurance',
  'Statutory & Compliance',
  'Transportation',
  'Other',
] as const;

export type ExpenseHead = (typeof EXPENSE_HEADS)[number];

export const DOCUMENT_TYPES = [
  'Tax Invoice',
  'Proforma Invoice',
  'Bill of Supply',
  'Credit Note',
  'Debit Note',
  'Receipt',
] as const;

// ────────────────────────────────────────────────────────────────────────────
// MASTER SITE DATA — stored in the SitesList tab of the same Google Sheet
// ────────────────────────────────────────────────────────────────────────────

/**
 * Master Site Data row. Matches the 17 columns defined in the user spec
 * section A. Column order MUST match the SitesList tab's header row.
 *
 * NOTE: PII fields (address, vendorEmail, vendorMobile) are stored as plain
 * text in Google Sheets — the sheet's share permissions are the access
 * control. If you need encrypted-at-rest PII, use MongoDB instead.
 */
export interface MasterSite {
  entity: string; // 1MGH / 1MGT / 1LFS
  status: string; // Site active status
  type: string; // LAB, PAC, Retail-CC, OHC, FC, HP, Med Affairs
  tag: string; // Site name
  region: string; // East / West / North / South
  state: string;
  address: string;
  vendorCode: string;
  vendorName: string;
  vendorEmail: string;
  vendorMobile: string;
  costCenter: string;
  hanaName: string; // Cost Center Description (HANA Name)
  businessAreaCode: string;
  taxCode: string;
  frequency: string;
  remarks: string;
}

/**
 * Column order in the SitesList tab. MUST match the sheet header row.
 * If your sheet has a different column order, edit this array.
 */
export const SITE_SHEET_COLUMN_ORDER: readonly (keyof MasterSite)[] = [
  'entity',
  'status',
  'type',
  'tag',
  'region',
  'state',
  'address',
  'vendorCode',
  'vendorName',
  'vendorEmail',
  'vendorMobile',
  'costCenter',
  'hanaName',
  'businessAreaCode',
  'taxCode',
  'frequency',
  'remarks',
];

/** Header labels as they appear in row 1 of the SitesList tab. */
export const SITE_SHEET_HEADERS: readonly string[] = [
  'Entity',
  'Status',
  'Type',
  'Tag',
  'Region',
  'State',
  'Address',
  'Vendor Code',
  'Vendor Name',
  'Vendor Email',
  'Vendor Mobile',
  'Cost Center',
  'HANA Name',
  'Business Area Code',
  'Tax Code',
  'Frequency',
  'Remarks',
];
