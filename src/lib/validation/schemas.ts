/**
 * Zod schemas for input validation at the API boundary.
 * Every API route MUST validate its input with one of these schemas
 * before doing any work — defense in depth.
 */
import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required')
    .max(64, 'Username too long')
    .regex(/^[A-Za-z0-9_.@-]+$/, 'Username contains invalid characters'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(256, 'Password too long'),
  // CSRF-lite: a value echoed from a non-persistent cookie set on page load.
  csrfToken: z.string().min(8).max(128).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const extractSchema = z.object({
  fileIds: z.array(z.string().min(1).max(200)).min(1).max(20),
});

export const invoiceRowSchema = z.object({
  vendorName: z.string().min(1).max(200),
  expensesHead: z.string().min(1).max(100),
  expensesDescription: z.string().max(2000).optional().default(''),
  invoiceNumber: z.string().max(200).optional().default(''),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a number'),
  gst: z.string().regex(/^\d+(\.\d{1,2})?$/, 'GST must be a number'),
  documentType: z.string().min(1).max(100).default('Tax Invoice'),
  hanaName: z.string().min(1).max(200), // link to master site
  fy: z.string().max(10).optional().default(''),
  month: z.string().max(20).optional().default(''),
});

export type InvoiceRowInput = z.infer<typeof invoiceRowSchema>;

export const pushToSheetsSchema = z.object({
  rows: z.array(invoiceRowSchema).min(1).max(50),
});

export type PushToSheetsInput = z.infer<typeof pushToSheetsSchema>;

export const seedSiteSchema = z.object({
  entity: z.string().min(1).max(50),
  status: z.string().max(50).default('Active'),
  type: z.string().max(50),
  tag: z.string().min(1).max(200),
  region: z.string().max(50),
  state: z.string().max(100),
  address: z.string().max(2000),
  vendorCode: z.string().max(50),
  vendorName: z.string().max(200),
  vendorEmail: z.string().max(500),
  vendorMobile: z.string().max(500),
  costCenter: z.string().max(50),
  hanaName: z.string().min(1).max(200),
  businessAreaCode: z.string().max(50),
  taxCode: z.string().max(50),
  frequency: z.string().max(50),
  remarks: z.string().max(2000).optional().default(''),
});

export type SeedSiteInput = z.infer<typeof seedSiteSchema>;
