'use client';

import { useState, useEffect } from 'react';
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
}

interface Props {
  files: ExtractedFile[];
  sites: MasterSite[];
  onClear: () => void;
  onPushed: () => void;
}

let _id = 0;
const nextId = () => `row_${Date.now()}_${++_id}`;

export default function ExtractionTable({ files, sites, onClear, onPushed }: Props) {
  const [rows, setRows] = useState<ReviewedRow[]>([]);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  // Initialize rows when files change
  useEffect(() => {
    setRows(
      files.map((f) => ({
        id: nextId(),
        filename: f.filename,
        dataUrl: f.dataUrl,
        mimeType: f.mimeType,
        vendorName: f.extracted?.vendorName ?? '',
        expensesHead: f.suggestedExpenseHead ?? 'Other',
        expensesDescription: f.extracted?.expensesDescription ?? '',
        invoiceNumber: f.extracted?.invoiceNumber ?? '',
        amount: f.extracted?.amount ?? '',
        gst: f.extracted?.gst ?? '',
        totalAmount: f.extracted?.totalAmount ?? '',
        documentType: f.extracted?.documentType ?? 'Tax Invoice',
        hanaName: '',
        invoiceDate: f.extracted?.invoiceDate ?? '',
      })),
    );
  }, [files]);

  function update(id: string, field: keyof ReviewedRow, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function remove(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function autoMatchSite(idx: number) {
    const row = rows[idx];
    if (!row) return;
    // Try to match by vendor name first
    const vendorLower = row.vendorName.toLowerCase();
    const match =
      sites.find((s) => s.vendorName.toLowerCase() === vendorLower) ||
      sites.find((s) => vendorLower.includes(s.vendorName.toLowerCase().split(' ')[0])) ||
      sites.find((s) => s.vendorName.toLowerCase().includes(vendorLower));
    if (match) {
      update(row.id, 'hanaName', match.hanaName);
      toast.success(`Matched site: ${match.hanaName}`);
    } else {
      toast.info('No matching site found — pick one manually');
    }
  }

  async function handlePush() {
    // Validate
    const errors: string[] = [];
    rows.forEach((r, i) => {
      if (!r.vendorName) errors.push(`Row ${i + 1}: Vendor name required`);
      if (!r.expensesHead) errors.push(`Row ${i + 1}: Expense head required`);
      if (!r.amount || isNaN(Number(r.amount))) errors.push(`Row ${i + 1}: Valid amount required`);
      if (!r.gst || isNaN(Number(r.gst))) errors.push(`Row ${i + 1}: Valid GST required`);
      if (!r.hanaName) errors.push(`Row ${i + 1}: Site (HANA Name) required`);
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
          rows: rows.map((r) => ({
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
          })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || data.details || 'Push failed');
      }
      toast.success(`Pushed ${data.pushed} row(s) to Google Sheets`);
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
                  <Label className="text-xs">Vendor Name *</Label>
                  <Input
                    value={row.vendorName}
                    onChange={(e) => update(row.id, 'vendorName', e.target.value)}
                    className="h-8 text-sm"
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
                  <Select
                    value={row.hanaName}
                    onValueChange={(v) => update(row.id, 'hanaName', v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {sites.map((s) => (
                        <SelectItem key={s.hanaName} value={s.hanaName}>
                          {s.hanaName} · {s.entity} · {s.vendorName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
