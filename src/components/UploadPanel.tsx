'use client';

import { useState, useCallback, useRef } from 'react';
import { UploadCloud, FileText, Image as ImageIcon, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

export interface ExtractedFile {
  filename: string;
  mimeType: string;
  size: number;
  status: 'done' | 'error';
  error?: string;
  extracted?: {
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
  };
  suggestedExpenseHead?: string;
  dataUrl?: string;
}

interface Props {
  onExtracted: (files: ExtractedFile[]) => void;
}

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export default function UploadPanel({ onExtracted }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      if (files.length > 20) {
        setError('Maximum 20 files per upload.');
        return;
      }
      const invalid = files.filter((f) => !ALLOWED_TYPES.has(f.type));
      if (invalid.length > 0) {
        setError(`Unsupported file type(s): ${invalid.map((f) => f.name).join(', ')}`);
        return;
      }
      const tooBig = files.filter((f) => f.size > 10 * 1024 * 1024);
      if (tooBig.length > 0) {
        setError(`File(s) exceed 10 MB limit: ${tooBig.map((f) => f.name).join(', ')}`);
        return;
      }

      setError(null);
      setUploading(true);
      setProgress(10);

      try {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));

        setProgress(30);
        const resp = await fetch('/api/extract', {
          method: 'POST',
          body: fd,
        });
        setProgress(80);

        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || 'Extraction failed');
        }

        setProgress(100);
        const successful = data.results.filter((r: ExtractedFile) => r.status === 'done');
        const failed = data.results.filter((r: ExtractedFile) => r.status === 'error');

        if (successful.length > 0) {
          onExtracted(successful);
          toast.success(`Extracted ${successful.length} invoice(s)`);
        }
        if (failed.length > 0) {
          toast.error(`${failed.length} file(s) failed extraction`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setError(msg);
        toast.error(msg);
      } finally {
        setUploading(false);
        setTimeout(() => setProgress(0), 1000);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onExtracted],
  );

  return (
    <Card className="border-emerald-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-emerald-600" />
          Upload Invoices
        </CardTitle>
        <p className="text-sm text-slate-500">
          Drag & drop PDF, PNG, JPEG, or WEBP files (max 10 MB each, up to 20 at a time).
          Gemini AI will extract the data automatically.
        </p>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50'}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          {uploading ? (
            <div className="space-y-3">
              <Loader2 className="w-10 h-10 mx-auto animate-spin text-emerald-600" />
              <p className="text-sm font-medium text-slate-700">
                Extracting data with Gemini AI…
              </p>
              <Progress value={progress} className="h-2" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-center gap-2 text-slate-400">
                <FileText className="w-8 h-8" />
                <ImageIcon className="w-8 h-8" />
              </div>
              <p className="text-sm font-medium text-slate-700">
                Click to browse or drop files here
              </p>
              <p className="text-xs text-slate-400">PDF, PNG, JPEG, WEBP · max 10 MB each</p>
            </div>
          )}
        </div>
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
