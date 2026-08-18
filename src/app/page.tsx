'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, LogOut, ShieldCheck, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/sonner';
import LoginForm from '@/components/LoginForm';
import UploadPanel from '@/components/UploadPanel';
import ExtractionTable from '@/components/ExtractionTable';
import AuditLogPanel from '@/components/AuditLogPanel';
import SiteManager from '@/components/SiteManager';
import type { ExtractedFile } from '@/components/UploadPanel';
import { toast } from 'sonner';

interface MasterSite {
  hanaName: string;
  entity: string;
  vendorName: string;
  vendorCode: string;
  region: string;
  state: string;
}

interface HealthStatus {
  status: string;
  services: Record<string, boolean>;
  missing: string[];
}

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState('');
  const [booting, setBooting] = useState(true);
  const [files, setFiles] = useState<ExtractedFile[]>([]);
  const [sites, setSites] = useState<MasterSite[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me');
      if (r.ok) {
        const d = await r.json();
        setAuthed(true);
        setUsername(d.user.username);
      } else {
        setAuthed(false);
      }
    } catch {
      setAuthed(false);
    } finally {
      setBooting(false);
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/health');
      const d = await r.json();
      setHealth(d);
    } catch {
      setHealth(null);
    }
  }, []);

  const loadSites = useCallback(async () => {
    try {
      const r = await fetch('/api/sites');
      if (!r.ok) return;
      const d = await r.json();
      setSites(d.sites || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkAuth();
    checkHealth();
  }, [checkAuth, checkHealth]);

  useEffect(() => {
    if (authed) loadSites();
  }, [authed, loadSites]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthed(false);
    setUsername('');
    setFiles([]);
    toast.success('Signed out');
  }

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!authed) {
    return (
      <>
        <LoginForm
          onSuccess={(u) => {
            setAuthed(true);
            setUsername(u);
            checkHealth();
          }}
        />
        <Toaster />
      </>
    );
  }

  const missingCritical =
    health?.missing.filter((m) =>
      ['GEMINI_API_KEY', 'GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEET_ID'].some((c) =>
        m.includes(c.split(' ')[0]),
      ),
    ) ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold leading-tight">Invoice AI Tracker</h1>
              <p className="text-xs text-slate-500 leading-tight">
                Gemini-powered extraction → Google Sheets
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs hidden sm:inline-flex">
              <ShieldCheck className="w-3 h-3 mr-1 text-emerald-600" />
              AES-256 · JWT · {username}
            </Badge>
            <SiteManager onSeeded={loadSites} />
            <AuditLogPanel />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Health warning */}
      {missingCritical.length > 0 && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4">
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Missing configuration</AlertTitle>
            <AlertDescription>
              The following environment variables are not set: {missingCritical.join(', ')}.
              Set them in <code className="bg-red-50 px-1 rounded">.env.local</code> (or Vercel
              env settings) and restart. Some features will not work without them.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Sites count */}
      {sites.length === 0 && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4">
          <Alert>
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              No Master Site Data found in the <strong>SitesList</strong> tab of your
              Google Sheet. Click <strong>Manage Sites</strong> above and add at
              least one site so you can link extracted invoices to a HANA Name / Cost Center.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <UploadPanel onExtracted={(f) => setFiles((prev) => [...prev, ...f])} />

        {files.length > 0 && (
          <ExtractionTable
            files={files}
            sites={sites}
            onClear={() => setFiles([])}
            onPushed={() => {
              checkHealth();
              loadSites();
            }}
          />
        )}

        {files.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-slate-500">
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">
                Upload one or more invoice PDFs/images above. Gemini AI will extract vendor,
                amount, GST, and other fields automatically — you review and push to Google
                Sheets in one click.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Reference: Column mapping */}
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer hover:text-slate-800 font-medium">
            View column mapping reference (SitesList + MasterData)
          </summary>
          <div className="mt-2 p-3 bg-white border border-slate-200 rounded-lg space-y-3">
            <div>
              <p className="mb-1 font-semibold text-slate-700">
                SitesList tab (Master Site Data — 17 columns, A–Q)
              </p>
              <p className="mb-1">
                Vendor / site master records are read from and appended to this tab.
                Used for cost-center lookup when pushing invoices.
              </p>
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-1 list-disc pl-4">
                <li>Entity</li>
                <li>Status</li>
                <li>Type</li>
                <li>Tag</li>
                <li>Region</li>
                <li>State</li>
                <li>Address</li>
                <li>Vendor Code</li>
                <li>Vendor Name</li>
                <li>Vendor Email</li>
                <li>Vendor Mobile</li>
                <li>Cost Center</li>
                <li>HANA Name <span className="text-slate-400">(key)</span></li>
                <li>Business Area Code</li>
                <li>Tax Code</li>
                <li>Frequency</li>
                <li>Remarks</li>
              </ul>
            </div>
            <div className="border-t pt-3">
              <p className="mb-2">
                The following columns are pushed to the <code>MasterData</code> tab (Master Invoice
                Data — 25 columns). Fields marked{' '}
                <Badge variant="outline" className="text-[10px]">A</Badge> are left empty (auto-populated
                downstream by SAP / mail / payment systems).
              </p>
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-1 list-disc pl-4">
                <li>FY <span className="text-slate-400">(auto from date)</span></li>
                <li>Month <span className="text-slate-400">(auto)</span></li>
              <li>4D Print <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>Legal Entity <Badge variant="outline" className="text-[10px]">A</Badge> <span className="text-slate-400">(lookup)</span></li>
              <li>Cost Center Description (HANA Name) <span className="text-slate-400">(lookup)</span></li>
              <li>Cost Center Code <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>Expenses Head <span className="text-slate-400">(extracted)</span></li>
              <li>Expenses Description <span className="text-slate-400">(extracted)</span></li>
              <li>Vendor Code <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>Vendor Name <span className="text-slate-400">(extracted)</span></li>
              <li>Invoice / PO No. <span className="text-slate-400">(extracted)</span></li>
              <li>Amount <span className="text-slate-400">(extracted)</span></li>
              <li>GST <span className="text-slate-400">(extracted)</span></li>
              <li>Amount (inclusive of GST) <Badge variant="outline" className="text-[10px]">A</Badge> <span className="text-slate-400">(computed)</span></li>
              <li>Email address of inputer <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>PO <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>SES <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>SES Date <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>SES Remarks <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>Mail Status <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>Mail Sent On <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>SIte <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>Document Type <span className="text-slate-400">(default: Tax Invoice)</span></li>
              <li>Payment Date <Badge variant="outline" className="text-[10px]">A</Badge></li>
              <li>UTR Details <Badge variant="outline" className="text-[10px]">A</Badge></li>
              </ul>
            </div>
          </div>
        </details>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 text-xs text-slate-500 flex items-center justify-between flex-wrap gap-2">
          <span>
            Invoice AI Tracker · Next.js 16 + Gemini AI · Google Sheets as DB (SitesList + MasterData tabs) ·
            Audit log AES-256 encrypted · MongoDB optional
          </span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            {health?.services?.encryption ? 'Encryption active' : 'Encryption not configured'}
          </span>
        </div>
      </footer>

      <Toaster />
    </div>
  );
}
