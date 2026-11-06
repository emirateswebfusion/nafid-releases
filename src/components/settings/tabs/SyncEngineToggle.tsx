import { useSettingsSectionSave } from '../hooks/useSettingsSectionSave';
import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../../../data/settings';
import { useAuthStore } from '../../../store/authStore';
export function SyncEngineToggle() {
  const tenant = useAuthStore(s => s.tenantId) || 'global';
  const role = useAuthStore(s => s.role);
  const [saved, setSaved] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getSetting<string>({ tenant_id: tenant, key: 'sync_engine' }).then(value => {
      if (active) { setEnabled(value === 'outbox'); setSaved(value === 'outbox'); setBusy(false); }
    }).catch(() => { if (active) { setError('Could not load sync engine'); setBusy(false); } });
    return () => { active = false; };
  }, [tenant]);

  const toggle = async () => {
    setBusy(true); setError('');
    try {
      await setSetting({ tenant_id: tenant, key: 'sync_engine', value: enabled ? 'outbox' : 'legacy' });
      setSaved(enabled);
    } catch (error) { setError('Could not save sync engine'); throw error; }
    finally { setBusy(false); }
  };
  useSettingsSectionSave(enabled !== saved, toggle);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return null;
  return <div className="p-3 border border-border rounded-xl">
    <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} disabled={busy} onChange={() => setEnabled(value => !value)} />Sync engine (beta)</label>
    {error && <p role="alert">{error}</p>}
  </div>;
}
