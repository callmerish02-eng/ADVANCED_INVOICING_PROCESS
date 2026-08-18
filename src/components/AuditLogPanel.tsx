'use client';

import { useEffect, useState } from 'react';
import { Shield, LogIn, LogOut, FileSearch, Send, Database, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AuditEntry {
  action: string;
  actor: string;
  ip?: string;
  userAgent?: string;
  success: boolean;
  createdAt: string;
  details: Record<string, unknown>;
}

const ICONS: Record<string, React.ElementType> = {
  LOGIN_OK: LogIn,
  LOGIN_FAIL: LogIn,
  LOGOUT: LogOut,
  EXTRACT: FileSearch,
  SHEETS_PUSH: Send,
  SITE_SEED: Database,
};

export default function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/audit?limit=50');
      const d = await r.json();
      setEntries(d.entries || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Shield className="w-4 h-4 mr-1" /> Audit Log
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            Audit Log (last 50 actions)
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-8">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No audit entries yet.</p>
          ) : (
            <div className="space-y-2">
              {entries.map((e, i) => {
                const Icon = ICONS[e.action] || Shield;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg bg-white"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        e.success
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-red-50 text-red-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{e.action}</span>
                        <Badge variant={e.success ? 'default' : 'destructive'} className="text-xs">
                          {e.success ? 'OK' : 'FAIL'}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          by {e.actor}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(e.createdAt).toLocaleString()}
                        {e.ip ? ` · IP: ${e.ip}` : ''}
                      </p>
                      {Object.keys(e.details).length > 0 && (
                        <pre className="mt-1 text-[10px] text-slate-600 bg-slate-50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
