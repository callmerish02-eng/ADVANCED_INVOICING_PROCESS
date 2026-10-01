import { GoogleGenAI } from '@google/genai';
import { jsonrepair } from 'jsonrepair';
import { ExtractedInvoice } from '@/lib/types/invoice';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

export function suggestExpenseHead(description: string, vendorName: string = ''): string {
  const combined = `${description} ${vendorName}`.toLowerCase();

  // Bio-Medical Waste (BMW)
  if (
    combined.includes('bmw') ||
    combined.includes('bio medical') ||
    combined.includes('biomedical') ||
    combined.includes('waste') ||
    combined.includes('incinerat') ||
    combined.includes('color bags') ||
    combined.includes('synergy waste') ||
    combined.includes('maridi') ||
    combined.includes('ramky') ||
    combined.includes('pollutech')
  ) {
    return 'BMW Bills';
  }

  // Barcoding Bills
  if (
    combined.includes('barcode') ||
    combined.includes('bar code') ||
    combined.includes('barcoding') ||
    combined.includes('stickers') ||
    combined.includes('labels') ||
    combined.includes('thermal transfer') ||
    combined.includes('ribbon') ||
    combined.includes('scanner')
  ) {
    return 'Barcoding Bills';
  }

  if (combined.includes('housekeep') || combined.includes('clean') || combined.includes('pest')) {
    return 'Housekeeping & Sanitization';
  }
  if (combined.includes('securit') || combined.includes('guard')) {
    return 'Security Services';
  }
  if (combined.includes('courier') || combined.includes('logistics') || combined.includes('shipping') || combined.includes('freight')) {
    return 'Courier & Logistics';
  }
  if (combined.includes('rent') || combined.includes('lease')) {
    return 'Rent & Maintenance';
  }
  if (combined.includes('electric') || combined.includes('power') || combined.includes('water bill')) {
    return 'Electricity & Utilities';
  }
  if (combined.includes('amc') || combined.includes('maintenance') || combined.includes('repair')) {
    return 'Equipment Maintenance / AMC';
  }
  if (combined.includes('internet') || combined.includes('broadband') || combined.includes('telecom')) {
    return 'Internet & Telecom';
  }
  if (combined.includes('stationery') || combined.includes('print')) {
    return 'Printing & Stationery';
  }
  if (combined.includes('reagent') || combined.includes('vacutainer') || combined.includes('consumable')) {
    return 'Diagnostic Consumables';
  }

  return 'Other';
}

function cleanAndParseJSON(raw: string): any {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/i, '').trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      const repaired = jsonrepair(cleaned);
      return JSON.parse(repaired);
    } catch {
      return {
        vendorName: (cleaned.match(/"vendorName"\s*:\s*"([^"]+)"/) || [])[1] || '',
        buyerName: (cleaned.match(/"buyerName"\s*:\s*"([^"]+)"/) || [])[1] || '',
        buyerAddress: (cleaned.match(/"buyerAddress"\s*:\s*"([^"]+)"/) || [])[1] || '',
        detectedSite: (cleaned.match(/"detectedSite"\s*:\s*"([^"]+)"/) || [])[1] || '',
        invoiceNumber: (cleaned.match(/"invoiceNumber"\s*:\s*"([^"]+)"/) || [])[1] || '',
        invoiceDate: (cleaned.match(/"invoiceDate"\s*:\s*"([^"]+)"/) || [])[1] || '',
        amount: (cleaned.match(/"amount"\s*:\s*"([^"]+)"/) || [])[1] || '0',
        gst: (cleaned.match(/"gst"\s*:\s*"([^"]+)"/) || [])[1] || '0',
        totalAmount: (cleaned.match(/"totalAmount"\s*:\s*"([^"]+)"/) || [])[1] || '',
        documentType: (cleaned.match(/"documentType"\s*:\s*"([^"]+)"/) || [])[1] || 'Tax Invoice',
        expensesDescription: (cleaned.match(/"expensesDescription"\s*:\s*"([^"]+)"/) || [])[1] || '',
      };
    }
  }
}

export async function extractInvoice(input: {
  mimeType: string;
  base64Data: string;
}): Promise<ExtractedInvoice> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

  const prompt = `You are an expert Indian finance invoice reader. Analyze this document and extract the structured data in JSON format.
Distinguish between the SELLER/VENDOR and the BUYER/CUSTOMER/DELIVERY location.

Return ONLY a valid JSON object matching this schema:
{
  "vendorName": "Full legal name of the seller / supplier / service provider",
  "vendorAddress": "Registered address of the seller / supplier",
  "vendorGstin": "GSTIN of seller if present",
  "buyerName": "Legal entity billed to (e.g., Tata 1mg Healthcare Solutions, 1MG Technologies, 1MG Labs, etc.)",
  "buyerAddress": "Billed-to / Shipped-to / Delivery site physical address, including locality, city, state, and 6-digit PIN code",
  "buyerGstin": "GSTIN of the buyer if present",
  "detectedSite": "Any site, branch, lab, center or warehouse name mentioned (e.g. MG Road Lab, Sector 62 FC, Indiranagar PAC)",
  "invoiceNumber": "Invoice number or Bill number",
  "invoiceDate": "Normalized to DD/MM/YYYY format",
  "amount": "Base taxable amount in decimal string, excluding GST (e.g. 15000.00)",
  "gst": "Total GST amount (CGST + SGST or IGST) in decimal string (e.g. 2700.00)",
  "totalAmount": "Total invoice payable amount in decimal string (e.g. 17700.00)",
  "documentType": "Choose from: 'Tax Invoice', 'Bill of Supply', 'Credit Note', 'Debit Note', 'Proforma Invoice', 'Delivery Challan', 'Receipt / Cash Voucher'",
  "expensesDescription": "Clear summary of services or items billed (e.g. 'Bio-Medical Waste management for November', 'Barcode labels 50x25mm 20 rolls')"
}
Do not include markdown code fences or explanatory text.`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: input.mimeType, data: input.base64Data } },
          { text: prompt },
        ],
      },
    ],
  });

  const text = response.text || '';
  const parsed = cleanAndParseJSON(text);

  return {
    vendorName: parsed.vendorName || '',
    vendorAddress: parsed.vendorAddress || '',
    vendorGstin: parsed.vendorGstin || '',
    buyerName: parsed.buyerName || '',
    buyerAddress: parsed.buyerAddress || '',
    buyerGstin: parsed.buyerGstin || '',
    detectedSite: parsed.detectedSite || '',
    invoiceNumber: parsed.invoiceNumber || '',
    invoiceDate: parsed.invoiceDate || '',
    amount: parsed.amount ? String(parsed.amount).replace(/[^0-9.]/g, '') : '0.00',
    gst: parsed.gst ? String(parsed.gst).replace(/[^0-9.]/g, '') : '0.00',
    totalAmount: parsed.totalAmount ? String(parsed.totalAmount).replace(/[^0-9.]/g, '') : '',
    documentType: parsed.documentType || 'Tax Invoice',
    expensesDescription: parsed.expensesDescription || '',
    rawText: text,
  };
}
