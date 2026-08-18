'use client';

import { useState } from 'react';
import { Database, Plus, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Props {
  onSeeded: () => void;
}

const EMPTY = {
  entity: '',
  status: 'Active',
  type: '',
  tag: '',
  region: '',
  state: '',
  address: '',
  vendorCode: '',
  vendorName: '',
  vendorEmail: '',
  vendorMobile: '',
  costCenter: '',
  hanaName: '',
  businessAreaCode: '',
  taxCode: '',
  frequency: 'Monthly',
  remarks: '',
};

export default function SiteManager({ onSeeded }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [bulkText, setBulkText] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [loading, setLoading] = useState(false);

  function setField(k: keyof typeof EMPTY, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submitSingle() {
    if (!form.hanaName || !form.entity || !form.tag) {
      toast.error('HANA Name, Entity, and Tag are required');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/sites/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || 'Failed');
      }
      toast.success(`Site "${form.hanaName}" added`);
      setForm(EMPTY);
      onSeeded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function submitBulk() {
    let arr: unknown;
    try {
      arr = JSON.parse(bulkText);
    } catch {
      toast.error('Invalid JSON');
      return;
    }
    if (!Array.isArray(arr)) {
      toast.error('JSON must be an array of site objects');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/sites/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(arr),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      toast.success(`Added ${d.inserted} site(s)`);
      setBulkText('');
      onSeeded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Database className="w-4 h-4 mr-1" /> Manage Sites
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600" />
            Manage Master Site Data
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            variant={!bulkMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setBulkMode(false)}
            className={!bulkMode ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            <Plus className="w-3 h-3 mr-1" /> Single
          </Button>
          <Button
            variant={bulkMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setBulkMode(true)}
            className={bulkMode ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          >
            <Upload className="w-3 h-3 mr-1" /> Bulk JSON
          </Button>
        </div>

        {!bulkMode ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Entity *</Label>
              <Input value={form.entity} onChange={(e) => setField('entity', e.target.value)} className="h-8 text-sm" placeholder="1MGH / 1MGT / 1LFS" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Input value={form.status} onChange={(e) => setField('status', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Input value={form.type} onChange={(e) => setField('type', e.target.value)} className="h-8 text-sm" placeholder="LAB / PAC / Retail-CC / OHC / FC / HP / Med Affairs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tag (Site Name)</Label>
              <Input value={form.tag} onChange={(e) => setField('tag', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Region</Label>
              <Input value={form.region} onChange={(e) => setField('region', e.target.value)} className="h-8 text-sm" placeholder="East / West / North / South" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">State</Label>
              <Input value={form.state} onChange={(e) => setField('state', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Address (stored in SitesList tab)</Label>
              <Textarea value={form.address} onChange={(e) => setField('address', e.target.value)} className="text-sm" rows={2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendor Code</Label>
              <Input value={form.vendorCode} onChange={(e) => setField('vendorCode', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendor Name</Label>
              <Input value={form.vendorName} onChange={(e) => setField('vendorName', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendor Email (stored in SitesList)</Label>
              <Input value={form.vendorEmail} onChange={(e) => setField('vendorEmail', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendor Mobile (stored in SitesList)</Label>
              <Input value={form.vendorMobile} onChange={(e) => setField('vendorMobile', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cost Center</Label>
              <Input value={form.costCenter} onChange={(e) => setField('costCenter', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">HANA Name *</Label>
              <Input value={form.hanaName} onChange={(e) => setField('hanaName', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Business Area Code</Label>
              <Input value={form.businessAreaCode} onChange={(e) => setField('businessAreaCode', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tax Code</Label>
              <Input value={form.taxCode} onChange={(e) => setField('taxCode', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Frequency</Label>
              <Input value={form.frequency} onChange={(e) => setField('frequency', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Remarks</Label>
              <Input value={form.remarks} onChange={(e) => setField('remarks', e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="col-span-2 flex justify-end">
              <Button onClick={submitSingle} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
                {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                Add Site
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Paste a JSON array of site objects. Sites will be appended to the
              <strong> SitesList</strong> tab of the same Google Sheet (columns A–Q).
              If a site with the same <em>HANA Name</em> already exists, it will be
              updated in place rather than duplicated.
            </p>
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={12}
              className="text-xs font-mono"
              placeholder={`[
  {
    "entity": "1MGH",
    "type": "LAB",
    "tag": "MG Road Lab",
    "region": "South",
    "state": "Karnataka",
    "address": "123 MG Road, Bengaluru",
    "vendorCode": "V1000234",
    "vendorName": "ABC Diagnostics Pvt Ltd",
    "vendorEmail": "billing@abcdiag.com",
    "vendorMobile": "Ramesh - 9876543210",
    "costCenter": "1000234",
    "hanaName": "Bengaluru MG Road Lab",
    "businessAreaCode": "BA5678",
    "taxCode": "GST29",
    "frequency": "Monthly"
  }
]`}
            />
            <Button onClick={submitBulk} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              Import Sites
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
