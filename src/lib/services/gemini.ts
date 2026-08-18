/**
 * Gemini AI extraction service.
 *
 * Uses @google/genai SDK to call the gemini-2.5-flash-lite model with
 * inline_data parts (PDF and image both supported as base64).
 *
 * The model is asked to return strict JSON matching the ExtractedInvoice
 * schema. We then validate with Zod before persisting.
 */
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';
import { EXPENSE_HEADS } from '@/lib/types/invoice';

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

if (!API_KEY) {
  console.warn('[gemini] GEMINI_API_KEY is not set. Extraction will fail at runtime.');
}

const extractionResponseSchema = z.object({
  vendorName: z.string().max(200),
  vendorAddress: z.string().max(1000).optional().default(''),
  invoiceNumber: z.string().max(200).optional().default(''),
  invoiceDate: z.string().max(50).optional().default(''),
  amount: z.string().optional().default(''),
  gst: z.string().optional().default(''),
  totalAmount: z.string().optional().default(''),
  documentType: z.string().optional().default('Tax Invoice'),
  expensesDescription: z.string().max(2000).optional().default(''),
  rawText: z.string().optional().default(''),
});

export type GeminiExtractionResult = z.infer<typeof extractionResponseSchema>;

const SYSTEM_PROMPT = `You are an invoice data extraction assistant for a healthcare company.
From the provided invoice document (PDF or image), extract the following fields and return them as STRICT JSON.

Rules:
- All monetary values must be NUMERIC STRINGS without currency symbols (e.g. "15000.00", not "₹15,000").
- "amount" = base/subtotal amount BEFORE GST.
- "gst" = the GST/tax amount separately stated on the invoice.
- "totalAmount" = grand total INCLUDING GST.
- If a field is not present, return an empty string "".
- "invoiceDate" must be in DD/MM/YYYY format if visible; otherwise "".
- "documentType" must be one of: "Tax Invoice", "Bill of Supply", "Credit Note", "Debit Note", "Receipt". Default to "Tax Invoice" if unclear.
- "expensesDescription" should be a 1-line summary of what the invoice is for (e.g. "Monthly pathology lab rent", "AMC for centrifuge", "Housekeeping services - June 2025").
- "vendorName" should be the legal name of the supplier as printed on the invoice.
- DO NOT include any text outside the JSON object. No markdown, no commentary.

Output schema:
{
  "vendorName": string,
  "vendorAddress": string,
  "invoiceNumber": string,
  "invoiceDate": string,
  "amount": string,
  "gst": string,
  "totalAmount": string,
  "documentType": string,
  "expensesDescription": string,
  "rawText": string  // first 1500 chars of extracted text from the invoice
}`;

interface ExtractArgs {
  mimeType: string;
  base64Data: string;
}

export async function extractInvoice({
  mimeType,
  base64Data,
}: ExtractArgs): Promise<GeminiExtractionResult> {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured. Set it in the environment.');
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // The @google/genai SDK accepts inline_data parts directly.
  // PDFs, PNGs, JPEGs, and WEBPs are all supported by gemini-2.5-flash-lite.
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: 'Extract the invoice data and return strict JSON per the system instructions.',
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0,
      topP: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text ?? '';

  // Extract the JSON object from the response — Gemini sometimes wraps it
  // in markdown code fences or prepends commentary like "Here is the JSON:".
  // Find the first '{' and the matching last '}' to isolate the JSON body.
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  let jsonStr = text;
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonStr = text.slice(firstBrace, lastBrace + 1);
  }

  // Strip any markdown code fences that survived the slice
  jsonStr = jsonStr
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  let usedRepair = false;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (originalErr) {
    // Gemini occasionally returns invalid JSON — most commonly:
    //   - Literal newlines inside string values (e.g. in `rawText`)
    //   - Trailing commas
    //   - Unescaped quotes inside strings
    // Try repairing with jsonrepair before giving up.
    try {
      const repaired = jsonrepair(jsonStr);
      parsed = JSON.parse(repaired);
      usedRepair = true;
      console.info(
        '[gemini] JSON was malformed (likely unescaped newlines in rawText). Auto-repaired successfully.',
      );
    } catch (repairErr) {
      console.error('[gemini] Failed to parse JSON even after jsonrepair:');
      console.error('  Original error:', originalErr instanceof Error ? originalErr.message : originalErr);
      console.error('  Repair error:   ', repairErr instanceof Error ? repairErr.message : repairErr);
      console.error('  Raw response (first 1000 chars):');
      console.error(text.slice(0, 1000));
      throw new Error(
        'Gemini returned malformed JSON that could not be auto-repaired. Please retry the upload.',
      );
    }
  }

  void usedRepair; // for future telemetry

  const result = extractionResponseSchema.parse(parsed);
  return result;
}

/**
 * Suggest an expense head from the description, mapping common keywords
 * to the predefined EXPENSE_HEADS list. The user can still override.
 */
export function suggestExpenseHead(description: string): string {
  const d = description.toLowerCase();
  const rules: Array<[string[], string]> = [
    [['rent', 'lease'], 'Rent'],
    [['electric', 'power', 'light'], 'Electricity'],
    [['water', 'sewage'], 'Water'],
    [['internet', 'broadband', 'telecom', 'telephone'], 'Internet & Telecom'],
    [['housekeep', 'cleaning', 'janitor'], 'Housekeeping'],
    [['security', 'guard'], 'Security'],
    [['manpower', 'staffing', 'agency staff'], 'Manpower & Staffing'],
    [['maintenance', 'repair', 'service'], 'Repairs & Maintenance'],
    [['amc', 'cmc', 'annual maintenance'], 'AMC / CMC'],
    [['consumable', 'reagent', 'glove', 'syringe'], 'Consumables'],
    [['stationery', 'printing', 'paper'], 'Stationery & Printing'],
    [['travel', 'conveyance', 'cab', 'fuel'], 'Travel & Conveyance'],
    [['professional', 'consulting', 'fee'], 'Professional Fees'],
    [['waste', 'biomedical'], 'Waste Management'],
    [['pantry', 'tea', 'coffee', 'refreshment'], 'Pantry & Refreshments'],
    [['insurance'], 'Insurance'],
    [['statutory', 'compliance', 'gst', 'tds'], 'Statutory & Compliance'],
    [['transport', 'courier', 'logistics'], 'Transportation'],
  ];
  for (const [keys, head] of rules) {
    if (keys.some((k) => d.includes(k))) {
      return EXPENSE_HEADS.includes(head as never) ? head : 'Other';
    }
  }
  return 'Other';
}
