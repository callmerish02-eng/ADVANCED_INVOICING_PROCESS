'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  Save,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import SearchableCombobox from '@/components/ui/combobox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EXPENSE_HEADS, DOCUMENT_TYPES } from '@/lib/types/invoice';
import type { ExtractedFile } from './UploadPanel';
import { toast } from 'sonner';

export interface ReviewedRow {
  id: string;
  filename: string;
  dataUrl?: string;
  mimeType: string;
  vendorName: string;
  vendorAddress: string;
  expensesHead: string;
  expensesDescription: string;
  invoiceNumber: string;
  amount: string;
  gst: string;
  totalAmount: string;
  documentType: string;
  hanaName: string;
  invoiceDate: string;
}

interface MasterSite {
  hanaName: string;
  entity: string;
  vendorName: string;
  vendorCode: string;
  region: string;
  state: string;
  address: string;
}

interface Props {
  files: ExtractedFile[];
  sites: MasterSite[];
  onClear: () => void;
  onPushed: () => void;
}

let _id = 0;
const nextId = () => `row_${Date.now()}_${++_id}`;

// Common stopwords to ignore when matching addresses
const STOPWORDS = new Set([
  'india', 'india.', 'gujarat', 'maharashtra', 'delhi', 'karnataka',
  'tamil', 'nadu', 'west', 'bengal', 'pradesh', 'rajasthan',
  'road', 'street', 'ave', 'avenue', 'nagar', 'colony',
  'estate', 'industrial', 'area', 'sector', 'phase', 'plot',
  'private', 'limited', 'ltd', 'pvt', 'inc', 'llp', 'the', 'and',
  'near', 'nr', 'opposite', 'opp', 'behind', 'beside',
]);

/**
 * Match an invoice to a MasterSite. Priority:
 *   1. Address token overlap (vendor address from invoice vs site address)
 *   2. Vendor name exact match
 *   3. Vendor name token overlap
 *   4. Vendor name substring match
 *
 * Address matching splits both addresses into tokens (>= 4 chars, excluding
 * common stopwords like "road", "estate", "private") and counts how many
 * tokens from the invoice address appear in each site's address. The site
 * with the highest token overlap wins.
 */
function matchSite(
  invoiceAddress: string,
  invoiceVendorName: string,
  sites: MasterSite[],
): MasterSite | undefined {
  const addrLower = invoiceAddress.toLowerCase().trim();
  const vendorLower = invoiceVendorName.toLowerCase().trim();

  // 1. Address-based match
  if (addrLower) {
    const tokens = addrLower
      .split(/[\s,\-]+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
    if (tokens.length > 0) {
      const scored = sites
        .map((s) => {
          const siteAddr = (s.address || '').toLowerCase();
          const hits = tokens.filter((t) => siteAddr.includes(t)).length;
          return { site: s, hits };
        })
        .filter((x) => x.hits > 0)
        .sort((a, b) => b.hits - a.hits);
      if (scored.length > 0 && scored[0].hits >= 1) {
        return scored[0].site;
      }
    }
  }

  // 2. Vendor name exact match
  if (vendorLower) {
    const exact = sites.find((s) => s.vendorName.toLowerCase().trim() === vendorLower);
    if (exact) return exact;

    // 3. Vendor name token overlap (at least one significant token)
    const vendorTokens = vendorLower
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
    if (vendorTokens.length > 0) {
      const tokenMatch = sites.find((s) => {
        const sv = s.vendorName.toLowerCase();
        return vendorTokens.some((t) => sv.includes(t));
      });
      if (tokenMatch) return tokenMatch;
    }

    // 4. Substring match (either direction)
    const sub = sites.find(
      (s) =>
        s.vendorName.toLowerCase().includes(vendorLower) ||
        vendorLower.includes(s.vendorName.toLowerCase()),
    );
    if (sub) return sub;
  }

  return undefined;
}

export default function ExtractionTable({ files, sites, onClear, onPushed }: Props) {
  const [rows, setRows] = useState<ReviewedRow[]>([]);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  // Initialize rows when files change — auto-match HANA Name based on address
  useEffect(() => {
    const newRows = files.map((f) => {
      const vendorName = f.extracted?.vendorName ?? '';
      const vendorAddress = f.extracted?.vendorAddress ?? '';
      const match = matchSite(vendorAddress, vendorName, sites);
      // Vendor Name comes from the matched site (SitesList), NOT from the
      // invoice. If no site matched, vendorName stays empty and the user
      // must pick a site to populate it.
      const siteVendorName = match?.vendorName ?? '';
      return {
        id: nextId(),
        filename: f.filename,
        dataUrl: f.dataUrl,
        mimeType: f.mimeType,
        vendorName: siteVendorName,
        vendorAddress,
        expensesHead: f.suggestedExpenseHead ?? 'Other',
        expensesDescription: f.extracted?.expensesDescription ?? '',
        invoiceNumber: f.extracted?.invoiceNumber ?? '',
        amount: f.extracted?.amount ?? '',
        gst: f.extracted?.gst ?? '',
        totalAmount: f.extracted?.totalAmount ?? '',
        documentType: f.extracted?.documentType ?? 'Tax Invoice',
        hanaName: match?.hanaName ?? '',
        invoiceDate: f.extracted?.invoiceDate ?? '',
      };
    });
    setRows(newRows);
    // Toast summary of auto-matches
    const matchedCount = newRows.filter((r) => r.hanaName).length;
    if (matchedCount > 0) {
      toast.success(`Auto-matched ${matchedCount} of ${newRows.length} invoice(s) to sites by address`);
    }
  }, [files, sites]);

  function update(id: string, field: keyof ReviewedRow, value: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, [field]: value };
        // When HANA Name changes, auto-populate Vendor Name from the
        // matched site. The Vendor Name field is read-only in the UI.
        if (field === 'hanaName') {
          const site = sites.find((s) => s.hanaName === value);
          next.vendorName = site?.vendorName ?? '';
        }
        return next;
      }),
    );
  }

  function remove(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  // Re-run the address-based match for a single row (manual button click).
  // Also updates vendorName to the matched site's vendor.
  function autoMatchSite(idx: number) {
    const row = rows[idx];
    if (!row) return;
    const match = matchSite(row.vendorAddress, row.vendorName, sites);
    if (match) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, hanaName: match.hanaName, vendorName: match.vendorName }
            : r,
        ),
      );
      toast.success(`Matched site: ${match.hanaName}`);
    } else {
      toast.info('No matching site found — pick one manually');
    }
  }

  // Build combobox options for HANA Name dropdown (memoized)
  const siteOptions = useMemo(
    () =>
      sites.map((s) => ({
        value: s.hanaName,
        label: s.hanaName,
        hint: `${s.entity} · ${s.vendorName}`,
      })),
    [sites],
  );

  async function handlePush() {
    // Validate
    const errors: string[] = [];
    rows.forEach((r, i) => {
      // Vendor name is NOT validated here — it comes from the SitesList
      // tab at push time via the HANA Name. We only require the HANA Name
      // to be set (which means a site was picked from the dropdown).
      if (!r.expensesHead) errors.push(`Row ${i + 1}: Expense head required`);
      if (!r.amount || isNaN(Number(r.amount))) errors.push(`Row ${i + 1}: Valid amount required`);
      if (!r.gst || isNaN(Number(r.gst))) errors.push(`Row ${i + 1}: Valid GST required`);
      if (!r.hanaName) errors.push(`Row ${i + 1}: Site (HANA Name) required — pick a site to populate vendor name`);
    });
    if (errors.length > 0) {
      setPushError(errors.slice(0, 5).join('\n'));
      return;
    }

    setPushError(null);
    setPushing(true);
    try {
      const resp = await fetch('/api/sheets/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rows.map((r) => {
            // Extract base64 file content from data URL (format: data:<mime>;base64,<data>)
            let fileData = '';
            let mimeType = r.mimeType;
            if (r.dataUrl && r.dataUrl.includes(',')) {
              const idx = r.dataUrl.indexOf(',');
              fileData = r.dataUrl.slice(idx + 1);
              // If mimeType wasn't set on the row, derive it from the data URL prefix
              if (!mimeType) {
                const match = r.dataUrl.match(/^data:([^;]+);base64/);
                if (match) mimeType = match[1];
              }
            }
            return {
              vendorName: r.vendorName,
              expensesHead: r.expensesHead,
              expensesDescription: r.expensesDescription,
              invoiceNumber: r.invoiceNumber,
              amount: r.amount,
              gst: r.gst,
              documentType: r.documentType,
              hanaName: r.hanaName,
              fy: '',
              month: '',
              // For Drive upload — derived from invoice date on the server
              invoiceDate: r.invoiceDate,
              filename: r.filename,
              mimeType: mimeType || '',
              fileData,
            };
          }),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || data.details || 'Push failed');
      }
      const filledRows = (data.filledRows as number[] | undefined) ?? [];
      const rowsLabel =
        filledRows.length > 0
          ? `at sheet row${filledRows.length > 1 ? 's' : ''} ${filledRows.join(', ')}`
          : 'to Google Sheets';
      // Report Drive upload results separately
      const driveResults = (data.drive as Array<{ filename: string; ok: boolean; url?: string; error?: string }>) ?? [];
      const driveOk = driveResults.filter((d) => d.ok).length;
      const driveFail = driveResults.filter((d) => !d.ok).length;
      let successMsg = `Pushed ${data.pushed} invoice(s) ${rowsLabel}`;
      if (driveResults.length > 0) {
        successMsg += ` · Drive: ${driveOk} uploaded`;
        if (driveFail > 0) successMsg += `, ${driveFail} failed`;
      }
      toast.success(successMsg);
      onPushed();
      onClear();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Push failed';
      setPushError(msg);
      toast.error(msg);
    } finally {
      setPushing(false);
    }
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card className="border-emerald-100">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          Review & Edit Extracted Data ({rows.length})
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            disabled={pushing}
          >
            <Trash2 className="w-4 h-4 mr-1" /> Clear all
          </Button>
          <Button
            onClick={handlePush}
            disabled={pushing || rows.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
            size="sm"
          >
            {pushing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Pushing…
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" /> Push to Sheets
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pushError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="whitespace-pre-line">{pushError}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-4">
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  {row.mimeType.includes('pdf') ? (
                    <FileText className="w-4 h-4 text-red-500 shrink-0" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                  )}
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {row.filename}
                  </span>
                  {row.invoiceDate && (
                    <Badge variant="outline" className="text-xs">
                      {row.invoiceDate}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {row.dataUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewIdx(previewIdx === idx ? null : idx)}
                    >
                      {previewIdx === idx ? 'Hide' : 'Preview'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(row.id)}
                    disabled={pushing}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>

              {previewIdx === idx && row.dataUrl && (
                <div className="mb-3 p-2 bg-slate-50 rounded border max-h-96 overflow-auto">
                  {row.mimeType.includes('pdf') ? (
                    <iframe
                      src={row.dataUrl}
                      title={row.filename}
                      className="w-full h-96 border-0"
                    />
                  ) : (
                    <img
                      src={row.dataUrl}
                      alt={row.filename}
                      className="max-h-96 mx-auto"
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">
                    Vendor Name
                    <span className="text-[10px] text-slate-400 ml-1">(from site)</span>
                  </Label>
                  <Input
                    value={row.vendorName}
                    readOnly
                    placeholder="— select a site —"
                    className="h-8 text-sm bg-slate-50 text-slate-600 cursor-not-allowed"
                    title="Vendor name comes from the SitesList tab — pick a HANA Name to populate this field"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Invoice / PO No.</Label>
                  <Input
                    value={row.invoiceNumber}
                    onChange={(e) => update(row.id, 'invoiceNumber', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount (excl GST) *</Label>
                  <Input
                    value={row.amount}
                    onChange={(e) => update(row.id, 'amount', e.target.value)}
                    className="h-8 text-sm"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">GST *</Label>
                  <Input
                    value={row.gst}
                    onChange={(e) => update(row.id, 'gst', e.target.value)}
                    className="h-8 text-sm"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total (incl GST)</Label>
                  <Input
                    value={
                      row.totalAmount ||
                      (row.amount && row.gst
                        ? (Number(row.amount) + Number(row.gst)).toFixed(2)
                        : '')
                    }
                    onChange={(e) => update(row.id, 'totalAmount', e.target.value)}
                    className="h-8 text-sm"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Document Type</Label>
                  <Select
                    value={row.documentType}
                    onValueChange={(v) => update(row.id, 'documentType', v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Expense Head *</Label>
                  <Select
                    value={row.expensesHead}
                    onValueChange={(v) => update(row.id, 'expensesHead', v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_HEADS.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Site / HANA Name *</Label>
                    <button
                      onClick={() => autoMatchSite(idx)}
                      className="text-[10px] text-emerald-600 hover:underline"
                      type="button"
                    >
                      Auto-match
                    </button>
                  </div>
                  <SearchableCombobox
                    options={siteOptions}
                    value={row.hanaName}
                    onChange={(v) => update(row.id, 'hanaName', v)}
                    placeholder="Select site"
                    searchPlaceholder="Search by HANA name, entity, or vendor..."
                    emptyText="No site found — try a different search term."
                    buttonClassName="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1 md:col-span-2 lg:col-span-4">
                  <Label className="text-xs">Expense Description</Label>
                  <Textarea
                    value={row.expensesDescription}
                    onChange={(e) => update(row.id, 'expensesDescription', e.target.value)}
                    className="text-sm min-h-[40px]"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
