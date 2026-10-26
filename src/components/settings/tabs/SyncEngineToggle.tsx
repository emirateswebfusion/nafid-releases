import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../../../data/settings';
import { useAuthStore } from '../../../store/authStore';
export function SyncEngineToggle() {
  const tenant = useAuthStore(s => s.tenantId) || 'global';
  const role = useAuthStore(s => s.role);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getSetting<string>({ tenant_id: tenant, key: 'sync_engine' }).then(value => {
      if (active) { setEnabled(value === 'outbox'); setBusy(false); }
    }).catch(() => { if (active) { setError('Could not load sync engine'); setBusy(false); } });
    return () => { active = false; };
  }, [tenant]);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return null;
  const toggle = async () => {
    setBusy(true); setError('');
    try {
      await setSetting({ tenant_id: tenant, key: 'sync_engine', value: enabled ? 'legacy' : 'outbox' });
      setEnabled(!enabled);
    } catch { setError('Could not save sync engine'); }
    finally { setBusy(false); }
  };
  return <div className="p-3 border border-border rounded-xl">
    <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} disabled={busy} onChange={() => void toggle()} />Sync engine (beta)</label>
    {error && <p role="alert">{error}</p>}
  </div>;
}
