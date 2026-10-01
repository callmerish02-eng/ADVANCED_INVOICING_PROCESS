export interface ExtractedInvoice {
  vendorName: string;
  vendorAddress?: string;
  vendorGstin?: string;
  buyerName?: string; // Entity or internal billed-to client name (e.g. 1MGH, 1MGT)
  buyerAddress?: string; // Delivery / Site physical address for matching
  buyerGstin?: string;
  detectedSite?: string; // Branch / site / facility name if printed on invoice
  invoiceNumber: string;
  invoiceDate: string; // Normalized to DD/MM/YYYY
  amount: string; // Base amount excluding GST
  gst: string; // GST amount
  totalAmount?: string; // Gross amount including GST
  documentType: string;
  expensesDescription: string;
  rawText?: string;
}

export const EXPENSE_HEADS = [
  'BMW Bills', // Bio-Medical Waste
  'Barcoding Bills', // Barcode labels & scanning
  'Housekeeping & Sanitization',
  'Security Services',
  'Rent & Maintenance',
  'Courier & Logistics',
  'Electricity & Utilities',
  'Equipment Maintenance / AMC',
  'Printing & Stationery',
  'Internet & Telecom',
  'Diagnostic Consumables',
  'Other',
] as const;

export type ExpenseHead = (typeof EXPENSE_HEADS)[number];

export const DOCUMENT_TYPES = [
  'Tax Invoice',
  'Bill of Supply',
  'Credit Note',
  'Debit Note',
  'Proforma Invoice',
  'Delivery Challan',
  'Receipt / Cash Voucher',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface MasterSite {
  entity: string;
  status: string;
  type: string;
  tag: string;
  region: string;
  state: string;
  address: string;
  vendorCode: string;
  vendorName: string;
  vendorEmail: string;
  vendorMobile: string;
  costCenter: string;
  hanaName: string;
  businessAreaCode: string;
  taxCode: string;
  frequency: string;
  remarks: string;
}

export const SITE_SHEET_COLUMN_ORDER = [
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
] as const;

export interface InvoiceRow {
  FY: string;
  Month: string;
  '4D Print': string;
  'Legal Entity': string;
  'Cost Center Description (HANA Name)': string;
  'Cost Center Code': string;
  'Expenses Head': string;
  'Expenses Description': string;
  'Vendor Code': string;
  'Vendor Name': string;
  'Invoice / PO No.': string;
  Amount: string;
  GST: string;
  'Amount (inclusive of GST)': string;
  'Email address of inputer': string;
  PO: string;
  SES: string;
  'SES Date': string;
  'SES Remarks': string;
  'Mail Status': string;
  'Mail Sent On': string;
  SIte: string;
  'Document Type': string;
  'Payment Date': string;
  'UTR Details': string;
}
