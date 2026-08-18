'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, LogOut, ShieldCheck, AlertTriangle, FileSpreadsheet, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  address: string;
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
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-700" />
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
    <div className="min-h-screen flex flex-col bg-slate-100">
      {/* Top accent bar */}
      <div className="h-1 bg-emerald-700" />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="w-full px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-700 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-white" />
            </div>
            <div className="border-r border-slate-200 pr-3">
              <h1 className="text-sm font-semibold tracking-tight text-slate-900 uppercase">
                Invoice Tracker
              </h1>
              <p className="text-[10px] text-slate-500 leading-tight uppercase tracking-wider">
                AI-Powered · Sheets Integration
              </p>
            </div>
            <nav className="hidden md:flex items-center text-xs text-slate-500">
              <span className="hover:text-slate-900 cursor-pointer">Dashboard</span>
              <ChevronRight className="w-3 h-3 mx-1" />
              <span className="text-slate-900 font-medium">Invoices</span>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <SiteManager onSeeded={loadSites} />
            <AuditLogPanel />
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <div className="hidden sm:flex items-center gap-2 px-2">
              <div className="w-7 h-7 rounded-full bg-slate-700 text-white text-xs font-semibold flex items-center justify-center">
                {username.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-slate-600 font-medium">{username}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-600 hover:text-slate-900">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content area — full width */}
      <main className="flex-1 w-full px-6 py-6 space-y-6">
        {/* Health warning */}
        {missingCritical.length > 0 && (
          <Alert variant="destructive" className="rounded-none border-l-4 border-l-red-600">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle className="text-sm font-semibold uppercase tracking-wide">Configuration Required</AlertTitle>
            <AlertDescription className="text-sm">
              The following environment variables are not set: <strong>{missingCritical.join(', ')}</strong>.
              Set them in <code className="bg-red-50 px-1 py-0.5 text-xs">{`<project>/.env.local`}</code> or in
              your Vercel project settings, then restart.
            </AlertDescription>
          </Alert>
        )}

        {/* Sites count */}
        {sites.length === 0 && (
          <Alert className="rounded-none border-l-4 border-l-amber-500 bg-amber-50">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <AlertDescription className="text-sm text-amber-900">
              No Master Site Data found in the <strong>SitesList</strong> tab of your Google Sheet.
              Click <strong>Manage Sites</strong> above and add at least one site so you can link
              extracted invoices to a HANA Name / Cost Center.
            </AlertDescription>
          </Alert>
        )}

        {/* Stat bar — minimal, professional */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
          <div className="bg-white p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Pending Invoices</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{files.length}</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Master Sites</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{sites.length}</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">System Status</p>
            <p className={`text-sm font-semibold mt-1 ${missingCritical.length === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {missingCritical.length === 0 ? '● Operational' : '● Degraded'}
            </p>
          </div>
          <div className="bg-white p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Encryption</p>
            <p className={`text-sm font-semibold mt-1 ${health?.services?.encryption ? 'text-emerald-700' : 'text-red-700'}`}>
              {health?.services?.encryption ? '● AES-256 Active' : '● Not configured'}
            </p>
          </div>
        </div>

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
          <Card className="border-slate-200 rounded-none">
            <CardContent className="py-16 text-center">
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Upload one or more invoice PDFs or images above. Gemini AI will extract
                vendor, amount, GST, and other fields automatically — you review and push
                to Google Sheets in one click.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Reference: Column mapping */}
        <details className="text-xs text-slate-600 group">
          <summary className="cursor-pointer hover:text-slate-900 font-semibold uppercase tracking-wide text-[10px] py-2 border-t border-slate-200">
            ▸ Column Mapping Reference (SitesList + MasterData)
          </summary>
          <div className="mt-2 p-4 bg-white border border-slate-200 space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                SitesList Tab — Master Site Data (17 columns, A–Q)
              </p>
              <p className="mb-2 text-slate-600">
                Vendor / site master records are read from and appended to this tab.
                Used for cost-center lookup when pushing invoices.
              </p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-1 text-[11px]">
                {['Entity','Status','Type','Tag','Region','State','Address','Vendor Code','Vendor Name','Vendor Email','Vendor Mobile','Cost Center','HANA Name (key)','Business Area Code','Tax Code','Frequency','Remarks'].map(c => (
                  <div key={c} className="px-2 py-1 bg-slate-50 border border-slate-200">{c}</div>
                ))}
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                MasterData Tab — Master Invoice Data (25 columns, A–Y)
              </p>
              <p className="mb-2 text-slate-600">
                Cells written by the app: <strong>A</strong> (FY), <strong>B</strong> (Month),
                <strong> E</strong> (HANA Name), <strong>G</strong> (Expenses Head),
                <strong> H</strong> (Description), <strong>J</strong> (Vendor Name),
                <strong> K</strong> (Invoice No.), <strong>L</strong> (Amount),
                <strong> M</strong> (GST), <strong>W</strong> (Document Type).
                All other columns are left untouched to preserve formulas.
              </p>
            </div>
          </div>
        </details>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 mt-auto">
        <div className="w-full px-6 py-3 flex items-center justify-between flex-wrap gap-2 text-[10px] uppercase tracking-wider">
          <span>
            Invoice AI Tracker · Internal Finance Operations
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              {health?.services?.encryption ? 'Encryption Active' : 'No Encryption'}
            </span>
            <span>·</span>
            <span>Next.js 16 · Gemini AI · Google Sheets + Drive</span>
          </span>
        </div>
      </footer>

      <Toaster />
    </div>
  );
}
