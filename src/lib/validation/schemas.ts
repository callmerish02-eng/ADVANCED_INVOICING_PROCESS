import { z } from 'zod';
import { EXPENSE_HEADS, DOCUMENT_TYPES } from '@/lib/types/invoice';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const seedSiteSchema = z.object({
  entity: z.string().min(1, 'Entity is required'),
  status: z.string().default('Active'),
  type: z.string().optional().default(''),
  tag: z.string().min(1, 'Tag is required'),
  region: z.string().optional().default(''),
  state: z.string().optional().default(''),
  address: z.string().optional().default(''),
  vendorCode: z.string().optional().default(''),
  vendorName: z.string().optional().default(''),
  vendorEmail: z.string().optional().default(''),
  vendorMobile: z.string().optional().default(''),
  costCenter: z.string().optional().default(''),
  hanaName: z.string().min(1, 'HANA Name is required'),
  businessAreaCode: z.string().optional().default(''),
  taxCode: z.string().optional().default(''),
  frequency: z.string().optional().default('Monthly'),
  remarks: z.string().optional().default(''),
});

export const pushToSheetsSchema = z.object({
  rows: z.array(
    z.object({
      vendorName: z.string().optional(),
      expensesHead: z.string().min(1, 'Expense head is required'),
      expensesDescription: z.string().optional(),
      invoiceNumber: z.string().optional(),
      amount: z.string().min(1, 'Amount is required'),
      gst: z.string().min(1, 'GST is required'),
      documentType: z.string().optional(),
      hanaName: z.string().min(1, 'HANA Name is required'),
      fy: z.string().optional(),
      month: z.string().optional(),
      invoiceDate: z.string().optional(),
      filename: z.string().optional(),
      mimeType: z.string().optional(),
      fileData: z.string().optional(),
      entity: z.string().optional(),
    })
  ),
  force: z.boolean().optional().default(false),
});
