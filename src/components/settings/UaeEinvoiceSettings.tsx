import { useSettingsSectionSave } from './hooks/useSettingsSectionSave';
import { useCallback, useEffect, useState } from 'react';
import { Building, CloudCog, Loader2 } from 'lucide-react';
import { getSetting, setSetting } from '../../data/settings';
import { einvoiceCloud, type AspEnvironment, type EinvoiceMode, type EinvoiceOverview } from '../../data/cloud/einvoiceCloud';
import { SELLER_SETTING_KEYS, einvoiceStatusLabel } from '../../utils/einvoice/einvoice';
import type { EinvoiceStatus } from '../../data/einvoice';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SettingsCard } from './views/SettingsControls';
import { EinvoiceInboundList } from './views/EinvoiceInboundList';

type SellerForm = Record<keyof typeof SELLER_SETTING_KEYS, string>;
const EMPTY_SELLER: SellerForm = { legalName: '', tin: '', tradeLicenseNo: '', tradeLicenseAuthority: '', street: '', city: '' };
const SELLER_LABELS: Record<keyof SellerForm, string> = {
  legalName: 'Legal name (as on trade licence)', tin: 'TIN (only if the shop has no TRN)', tradeLicenseNo: 'Trade licence number',
  tradeLicenseAuthority: 'Licence issuing authority', street: 'Street / building', city: 'City',
};
const MODES: { value: EinvoiceMode; label: string }[] = [
  { value: 'OFF', label: 'Off' }, { value: 'VOLUNTARY', label: 'Voluntary (before your mandatory date)' }, { value: 'MANDATORY', label: 'Mandatory' },
];
const field = 'text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1.5 block';
const settingText = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));

/**
 * UAE e-invoicing (Peppol PINT AE) settings: the seller identity printed into every e-invoice (synced shop settings;
 * TRN and emirate come from Tax settings), and the cloud configuration — mode, ASP, start date and ASP credentials.
 */
export function UaeEinvoiceSettings({ tenantId }: { tenantId: string | null }) {
  const tenant_id = tenantId || 'global';
  const [seller, setSeller] = useState<SellerForm>(EMPTY_SELLER);
  const [overview, setOverview] = useState<EinvoiceOverview | null>(null);
  const [cloud, setCloud] = useState({ mode: 'OFF' as EinvoiceMode, provider_id: 'sandbox', environment: 'SANDBOX' as AspEnvironment, start_date: new Date().toISOString().slice(0, 10) });
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [savedSeller, setSavedSeller] = useState('');
  const [savedCloud, setSavedCloud] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const loadCloud = useCallback(async () => {
    try {
      const data = await einvoiceCloud.getOverview();
      setOverview(data);
      const nextCloud = { mode: data.settings.mode, provider_id: data.settings.provider_id, environment: data.settings.environment, start_date: data.settings.start_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10) };
      setCloud(nextCloud); setSavedCloud(JSON.stringify(nextCloud));
    } catch (err) {
      setMessage({ text: `Cloud settings unavailable: ${err instanceof Error ? err.message : 'offline'}`, ok: false });
    }
  }, []);

  useEffect(() => {
    let active = true;
    const keys = Object.entries(SELLER_SETTING_KEYS) as [keyof SellerForm, string][];
    void Promise.all(keys.map(([, key]) => getSetting({ tenant_id, key }))).then(values => {
      if (active) { const next = Object.fromEntries(keys.map(([name], i) => [name, settingText(values[i])])) as SellerForm; setSeller(next); setSavedSeller(JSON.stringify(next)); }
    });
    void loadCloud();
    return () => { active = false; };
  }, [tenant_id, loadCloud]);

  const run = async (label: string, task: () => Promise<string>) => {
    setBusy(label);
    setMessage(null);
    try {
      setMessage({ text: await task(), ok: true });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Failed', ok: false });
    } finally {
      setBusy('');
    }
  };

  useSettingsSectionSave(!!savedSeller && JSON.stringify(seller) !== savedSeller, async () => {
    for (const [name, key] of Object.entries(SELLER_SETTING_KEYS) as [keyof SellerForm, string][]) await setSetting({ tenant_id, key, value: seller[name].trim() });
    setSavedSeller(JSON.stringify(seller));
  });
  useSettingsSectionSave(!!savedCloud && JSON.stringify(cloud) !== savedCloud, async () => {
    await einvoiceCloud.saveSettings(cloud); setSavedCloud(JSON.stringify(cloud));
  });
  useSettingsSectionSave(Object.keys(credentials).length > 0, async () => {
    const result = await einvoiceCloud.saveConnection(cloud.provider_id, cloud.environment, credentials);
    if (!result.connected) throw new Error(result.message || 'Could not connect to the service provider');
    setCredentials({});
  });
  const processNow = () => run('process', async () => {
    if (JSON.stringify(cloud) !== savedCloud) throw new Error('Save Changes before sending with this configuration.');
    const r = await einvoiceCloud.processNow();
    await loadCloud();
    return `Processed: ${r.built} prepared, ${r.submitted} sent, ${r.checked} status checks, ${r.received} received.`;
  });

  const provider = overview?.providers.find(p => p.id === cloud.provider_id);
  const button = (label: string, onClick: () => void, text: string) => (
    <button type="button" onClick={onClick} disabled={!!busy} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-60 inline-flex items-center gap-2">
      {busy === label && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{text}
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {message && <p className={message.ok ? 'text-xs text-emerald-600' : 'text-xs text-red-600'}>{message.text}</p>}
      <SettingsCard icon={Building} title="Seller identity" subtitle="Printed into every e-invoice. TRN and emirate are taken from Tax settings.">
        <div className="grid grid-cols-2 gap-4">
          {(Object.keys(SELLER_LABELS) as (keyof SellerForm)[]).map(name => (
            <div key={name}><span className={field}>{SELLER_LABELS[name]}</span>
              <Input value={seller[name]} onChange={e => setSeller(prev => ({ ...prev, [name]: e.target.value }))} /></div>
          ))}
        </div>

      </SettingsCard>

      <SettingsCard icon={CloudCog} title="E-invoicing service" subtitle="Sales to business and government buyers are sent through your Accredited Service Provider. Walk-in consumer sales are not e-invoiced.">
        <div className="grid grid-cols-2 gap-4">
          <div><span className={field}>Mode</span><Select value={cloud.mode} onChange={v => setCloud(c => ({ ...c, mode: v as EinvoiceMode }))} options={MODES} /></div>
          <div><span className={field}>Start with invoices dated from</span>
            <Input type="date" value={cloud.start_date} onChange={e => setCloud(c => ({ ...c, start_date: e.target.value }))} /></div>
          <div><span className={field}>Service provider (ASP)</span>
            <Select value={cloud.provider_id} onChange={v => setCloud(c => ({ ...c, provider_id: v }))}
              options={(overview?.providers ?? []).map(p => ({ value: p.id, label: p.status === 'ACTIVE' ? p.name : `${p.name} (agreement required)` }))} /></div>
          <div><span className={field}>Environment</span>
            <Select value={cloud.environment} onChange={v => setCloud(c => ({ ...c, environment: v as AspEnvironment }))}
              options={(provider?.environments ?? ['SANDBOX']).map(e => ({ value: e, label: e === 'SANDBOX' ? 'Test (sandbox)' : 'Live' }))} /></div>
        </div>
        {provider && <p className="text-[11px] text-muted-foreground mt-3">{provider.legalEntity}. {provider.notes}</p>}
        <div className="mt-4 flex gap-3">{button('process', () => void processNow(), 'Send now')}</div>

        {provider && provider.credentialFields.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border grid grid-cols-2 gap-4">
            {provider.credentialFields.map(f => (
              <div key={f.key}><span className={field}>{f.label}</span>
                <Input type={f.secret ? 'password' : 'text'} value={credentials[f.key] ?? ''} placeholder={overview?.connection?.masked_config?.[f.key] ?? ''}
                  onChange={e => setCredentials(c => ({ ...c, [f.key]: e.target.value }))} /></div>
            ))}
            <div className="col-span-2"><p className="text-xs text-muted-foreground">Connection details are checked and saved with Save Changes.</p></div>
          </div>
        )}

        {overview && overview.counts.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border flex flex-wrap gap-2">
            {overview.counts.map(c => (
              <span key={c.status} className="text-[11px] px-2.5 py-1 rounded-full bg-muted font-bold">{einvoiceStatusLabel(c.status as EinvoiceStatus).label}: {c.count}</span>
            ))}
          </div>
        )}
      </SettingsCard>

      <EinvoiceInboundList />
    </div>
  );
}
