import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import {
  cardTerminalApi, hasCardTerminal, CARD_TERMINAL_PROVIDER_LABELS,
  type CardTerminalConfig, type CardTerminalProvider, type CardTerminalTransaction,
} from '../../../data/cardTerminal';
import { setSetting } from '../../../data/settings';
import { useAuthStore } from '../../../store/authStore';
import { formatCurrency } from '../../../utils/pricing/money';

/**
 * Hardware → Card terminal: the bank card machine this POS PC sends bill amounts to (device-local setting
 * `card_terminal_config`), connection test, and the journal with payments that still need checking.
 */
const LABEL = 'text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block';
const INPUT = 'bg-background/50 focus:bg-background border-border/80 focus:border-primary rounded-xl py-2.5 font-mono';
const BUTTON = 'flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-border/60 hover:bg-muted/30 disabled:opacity-50';

export const CardTerminalSettings: React.FC = () => {
  const tenantId = useAuthStore(s => s.tenantId) || 'global';
  const available = hasCardTerminal();
  const [config, setConfig] = useState<CardTerminalConfig | null>(null);
  const [providers, setProviders] = useState<CardTerminalProvider[]>([]);
  const [ports, setPorts] = useState<string[]>([]);
  const [rows, setRows] = useState<CardTerminalTransaction[]>([]);
  const [unresolved, setUnresolved] = useState<CardTerminalTransaction[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [authCodes, setAuthCodes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!available) return;
    try {
    const [status, portList, recent, open] = await Promise.all([
      cardTerminalApi.getStatus(), cardTerminalApi.listPorts(),
      cardTerminalApi.listTransactions({ tenant_id: tenantId, limit: 20 }), cardTerminalApi.listUnresolved({ tenant_id: tenantId }),
    ]);
    setConfig(status.config);
    setProviders(status.providers);
    setPorts(portList.map(p => p.path));
    setRows(recent);
    setUnresolved(open);
    } catch { setMessage({ ok: false, text: 'Could not load terminal settings. Reopen this page to try again.' }); }
  }, [available, tenantId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after awaiting the bridge (mount fetch).
  useEffect(() => { void load(); }, [load]);

  if (!available) return <p className="text-sm text-muted-foreground">Card terminals need the desktop app.</p>;
  if (!config) return message ? <p role="alert" className="text-sm text-red-600">{message.text}</p> : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  const update = (patch: Partial<CardTerminalConfig>) => setConfig({ ...config, ...patch });
  const save = async () => {
    setBusy(true);
    try {
      await setSetting({ tenant_id: tenantId, key: 'card_terminal_config', value: { ...config, enabled: false } });
      setMessage({ ok: true, text: 'Card terminal settings saved for this computer.' });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try {
      await setSetting({ tenant_id: tenantId, key: 'card_terminal_config', value: config });
      const res = await cardTerminalApi.test();
      setMessage({ ok: res.ok, text: res.message });
    } catch { setMessage({ ok: false, text: 'Could not check terminal setup. Please try again.' });
    } finally { setBusy(false); }
  };
  const resolve = async (row: CardTerminalTransaction, outcome: 'APPROVED' | 'DECLINED') => {
    const res = await cardTerminalApi.resolve({ ecr_ref: row.ecr_ref, outcome, auth_code: authCodes[row.ecr_ref] });
    setMessage(res.success ? { ok: true, text: 'Payment updated.' } : { ok: false, text: res.error || 'Could not update the payment' });
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <CreditCard className="w-4.5 h-4.5 text-primary" />
        <span className="text-xs font-black uppercase tracking-widest text-foreground">Card Terminal (bank card machine)</span>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2" role="status">
        <p className="text-sm font-bold text-amber-600">Setup pending · Automatic card terminal payments are under integration</p>
        <p className="text-sm text-muted-foreground">Your Super Admin configures the bank/provider connection. Save this shop's merchant and terminal details below. Automatic payments become available after the bank connector is installed and verified.</p>
        <p className="text-sm text-muted-foreground">Continue taking payments on the card machine and recording Card in billing as usual.</p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-2">
          <label className={LABEL}>Terminal type</label>
          <Select value={config.provider} onChange={v => update({ provider: v as CardTerminalProvider })}
            options={['UNCONFIGURED' as const, ...providers.filter(p => p !== 'MOCK' && p !== 'UNCONFIGURED')].map(p => ({ value: p, label: CARD_TERMINAL_PROVIDER_LABELS[p] || p }))} />
        </div>
        <label className="space-y-2"><span className={LABEL}>Merchant ID</span><Input value={config.merchantId || ''} maxLength={128} onChange={e => update({ merchantId: e.target.value })} className={INPUT} /></label>
        <label className="space-y-2"><span className={LABEL}>Terminal ID</span><Input value={config.terminalId || ''} maxLength={128} onChange={e => update({ terminalId: e.target.value })} className={INPUT} /></label>
        <div className="space-y-2">
          <label className={LABEL}>Connection</label>
          <Select value={config.connection.type} onChange={v => update({ connection: v === 'TCP' ? { type: 'TCP', host: '', port: 0 } : { type: 'SERIAL', path: ports[0] || 'COM3', baudRate: 9600 } })}
            options={[{ value: 'SERIAL', label: 'USB / Serial (COM port)' }, { value: 'TCP', label: 'Network (LAN IP)' }]} />
        </div>
        {config.connection.type === 'SERIAL' ? (
          <>
            <div className="space-y-2">
              <label className={LABEL}>COM port {ports.length > 0 && `(found: ${ports.join(', ')})`}</label>
              <Input type="text" value={config.connection.path} onChange={e => update({ connection: { type: 'SERIAL', path: e.target.value, baudRate: config.connection.type === 'SERIAL' ? config.connection.baudRate : 9600 } })} placeholder="COM3" className={INPUT} />
            </div>
            <div className="space-y-2">
              <label className={LABEL}>Baud rate</label>
              <Select value={String(config.connection.baudRate)} onChange={v => update({ connection: { type: 'SERIAL', path: config.connection.type === 'SERIAL' ? config.connection.path : 'COM3', baudRate: parseInt(v, 10) } })}
                options={['9600', '19200', '38400', '57600', '115200'].map(b => ({ value: b, label: b }))} />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className={LABEL}>Terminal IP address</label>
              <Input type="text" value={config.connection.host} onChange={e => update({ connection: { type: 'TCP', host: e.target.value.trim(), port: config.connection.type === 'TCP' ? config.connection.port : 0 } })} placeholder="192.168.1.50" className={INPUT} />
            </div>
            <div className="space-y-2">
              <label className={LABEL}>Port</label>
              <Input type="number" value={config.connection.type === 'TCP' ? String(config.connection.port || '') : ''} onChange={e => update({ connection: { type: 'TCP', host: config.connection.type === 'TCP' ? config.connection.host : '', port: parseInt(e.target.value, 10) || 0 } })} className={INPUT} />
            </div>
          </>
        )}
        <div className="space-y-2">
          <label className={LABEL}>Wait for the terminal (seconds)</label>
          <Input type="number" min={30} max={300} value={String(config.timeoutSeconds)} onChange={e => update({ timeoutSeconds: Math.min(300, Math.max(30, parseInt(e.target.value, 10) || 120)) })} className={INPUT} />
        </div>
        <label className="flex items-center gap-3 text-sm self-end pb-2">
          <input type="checkbox" checked={config.allowManualFallback} onChange={e => update({ allowManualFallback: e.target.checked })} className="w-4 h-4" />
          Allow manual card entry when the terminal is not reachable
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={save} className={clsx(BUTTON, 'bg-primary text-primary-foreground border-primary')}>Save</button>
        <button type="button" disabled={busy} onClick={test} className={BUTTON}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Check setup status</button>
        <button type="button" onClick={() => void load()} className={BUTTON}><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
      </div>
      {message && <p className={clsx('text-sm font-semibold', message.ok ? 'text-emerald-600' : 'text-red-600')}>{message.text}</p>}

      {unresolved.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Payments that need checking: the terminal never answered. Check each on the terminal slip.</p>
          {unresolved.map(row => (
            <div key={row.ecr_ref} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono">{row.created_at.slice(0, 16).replace('T', ' ')}</span>
              <span className="font-bold">{row.kind} {formatCurrency(row.amount_minor / 100)}</span>
              <span className="font-mono text-muted-foreground">ref {row.ecr_ref}</span>
              <Input type="text" placeholder="Auth code" value={authCodes[row.ecr_ref] || ''} onChange={e => setAuthCodes({ ...authCodes, [row.ecr_ref]: e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 12) })} className="w-28 py-1 text-xs" />
              <button type="button" disabled={!authCodes[row.ecr_ref]} onClick={() => resolve(row, 'APPROVED')} className={BUTTON}>Approved</button>
              <button type="button" onClick={() => resolve(row, 'DECLINED')} className={BUTTON}>Not charged</button>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-1">
          <p className={LABEL}>Last card terminal requests on this computer</p>
          <table className="w-full text-xs">
            <tbody>
              {rows.map(row => (
                <tr key={row.ecr_ref} className="border-b border-border/40">
                  <td className="py-1 font-mono">{row.created_at.slice(0, 16).replace('T', ' ')}</td>
                  <td>{row.kind}</td>
                  <td className="tabular-nums">{formatCurrency(row.amount_minor / 100)}</td>
                  <td className={clsx('font-bold', row.status === 'APPROVED' ? 'text-emerald-600' : row.status === 'SENT' || row.status === 'UNKNOWN' ? 'text-amber-600' : 'text-muted-foreground')}>{row.status}</td>
                  <td className="font-mono">{row.masked_pan || ''}</td>
                  <td className="font-mono">{row.auth_code ? `auth ${row.auth_code}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
