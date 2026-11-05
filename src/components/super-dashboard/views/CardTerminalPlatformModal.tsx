import { useEffect, useState } from 'react';
import { CreditCard, X } from 'lucide-react';
import { cardTerminalPlatform, type PlatformCardConnection } from '../../../data/cloud/cardTerminalPlatform';
import { CARD_TERMINAL_PROVIDER_LABELS } from '../../../data/cardTerminal';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';

const PROVIDERS = ['NETWORK', 'MAGNATI', 'GEIDEA', 'NEOPAY', 'PINE_LABS'] as const;

/** Platform credentials never enter shop settings or IPC; existing keys are represented by a boolean only. */
export function CardTerminalPlatformModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<PlatformCardConnection[]>([]);
  const [provider, setProvider] = useState('NETWORK');
  const [environment, setEnvironment] = useState<'TEST' | 'LIVE'>('TEST');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [clearCredentials, setClearCredentials] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void cardTerminalPlatform.list().then(result => {
      if (active) { setRows(result); setEndpoint(result.find(r => r.provider === 'NETWORK' && r.environment === 'TEST')?.endpoint || ''); }
    }).catch(() => { if (active) setError('Unable to load card terminal setup. Check the server connection and try again.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  const selected = rows.find(r => r.provider === provider && r.environment === environment);
  const choose = (nextProvider: string, nextEnvironment: 'TEST' | 'LIVE') => {
    setProvider(nextProvider); setEnvironment(nextEnvironment);
    setEndpoint(rows.find(r => r.provider === nextProvider && r.environment === nextEnvironment)?.endpoint || '');
    setApiKey(''); setApiSecret(''); setClearCredentials(false); setMessage('');
  };
  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const credentials = Object.fromEntries(Object.entries({ apiKey, apiSecret }).filter(([, value]) => value.length > 0));
      const result = await cardTerminalPlatform.save({ provider, environment, endpoint,
        ...(Object.keys(credentials).length > 0 ? { credentials } : {}), clearCredentials });
      setApiKey(''); setApiSecret(''); setClearCredentials(false);
      setRows(await cardTerminalPlatform.list()); setMessage(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save provider settings'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-label="Card terminal platform setup" className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl">
      <header className="flex items-center justify-between"><h2 className="font-bold flex items-center gap-2"><CreditCard className="w-5 h-5" />Card terminal providers</h2><button type="button" onClick={onClose} aria-label="Close card terminal setup"><X className="w-5 h-5" /></button></header>
      <p className="text-sm text-amber-600">Setup pending — automatic terminal payments are under integration.</p>
      <p className="text-sm text-muted-foreground">Save Nafid's provider connection here. Each shop sets its own merchant ID, terminal ID and USB/LAN connection in Settings → Hardware → Card Terminal.</p>
      <label className="block text-sm">Provider<Select value={provider} onChange={v => choose(v, environment)} options={PROVIDERS.map(p => ({ value: p, label: CARD_TERMINAL_PROVIDER_LABELS[p] }))} disabled={busy} /></label>
      <label className="block text-sm">Environment<Select value={environment} onChange={v => choose(provider, v === 'LIVE' ? 'LIVE' : 'TEST')} options={[{ value: 'TEST', label: 'Test' }, { value: 'LIVE', label: 'Live' }]} disabled={busy} /></label>
      <label className="block text-sm">Provider API endpoint<Input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://provider.example/api" disabled={busy} /></label>
      <p className="text-xs text-muted-foreground">Credentials: {selected?.credentialsSaved ? 'saved securely; leave both fields empty to keep them' : 'not saved'}. Enter replacement credentials together.</p>
      <label className="block text-sm">API key<Input type="password" autoComplete="new-password" value={apiKey} onChange={e => setApiKey(e.target.value)} disabled={busy || clearCredentials} /></label>
      <label className="block text-sm">API secret (if supplied)<Input type="password" autoComplete="new-password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} disabled={busy || clearCredentials} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={clearCredentials} disabled={busy} onChange={e => { setClearCredentials(e.target.checked); setApiKey(''); setApiSecret(''); }} />Remove saved credentials on Save</label>
      <p className="text-xs text-muted-foreground">Saving credentials does not activate payments. The provider connector and a successful terminal verification are still required. Manual card billing remains available.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      <button type="button" onClick={() => void save()} disabled={busy || Boolean(error && rows.length === 0)} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-50">{busy ? 'Please wait…' : 'Save provider setup'}</button>
    </section>
  </div>;
}
