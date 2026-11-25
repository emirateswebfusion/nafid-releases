import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { hasBridge } from '../../../data/client';
import { syncApi } from '../../../data/sync';
import type { ManualSyncResult } from '../../../data/manualSyncTypes';
import { useAuthStore } from '../../../store/authStore';

/** An explicit operation, separate from Settings drafts. Never clears or force-overwrites pending data. */
export function ManualSyncPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ManualSyncResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const running = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!hasBridge('manualCloudSync')) return null;
  const run = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setResult(null);
    const session = useAuthStore.getState();
    try {
      const reply = await syncApi.manualCloudSync({ confirm_complete: true });
      const current = useAuthStore.getState();
      if (mounted.current && current.tenantId === session.tenantId && current.userId === session.userId && current.token === session.token) {
        setResult({ ...reply, message: reply.status === 'QUEUED' ? 'Request saved. You can continue working.' : 'The request could not be confirmed. Your existing data is kept.' });
        setConfirming(false); setConfirmed(false);
      }
    } catch {
      const current = useAuthStore.getState();
      if (mounted.current && current.tenantId === session.tenantId && current.userId === session.userId && current.token === session.token) setResult({ status: 'FAILED', message: 'Sync could not be confirmed. Your local work is kept. Try again when connected.' });
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return <section className="rounded-2xl border border-border bg-card p-5 space-y-3" aria-label="Manual cloud sync">
    <h3 className="font-semibold">Sync this computer</h3>
    <p className="text-sm text-muted-foreground">Use the correct shop computer to send its account records to the cloud. Work continues in the background.</p>
    {confirming && <div className="rounded-lg border border-amber-500 p-3 space-y-3" role="group" aria-label="Confirm correct source computer">
      <p className="text-sm font-semibold">Important: only continue on the computer containing your complete, correct shop data.</p>
      <p className="text-sm">Different cloud account records may be updated using this computer. Backups are required before changes. This does not erase other cloud-only records.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm this computer contains the complete, correct shop data.</label>
      <button type="button" disabled={busy || !confirmed} onClick={() => void run()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Confirm and continue</button>
      <button type="button" disabled={busy} onClick={() => { setConfirming(false); setConfirmed(false); }} className="px-3 py-2">Cancel</button>
    </div>}
    <button type="button" disabled={busy || confirming} onClick={() => { setResult(null); setConfirming(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
      <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{busy ? 'Syncing…' : 'Sync now'}
    </button>
    {result && <p role={result.status === 'FAILED' || result.status === 'BLOCKED' ? 'alert' : 'status'} className="text-sm">{result.message}</p>}
  </section>;
}
