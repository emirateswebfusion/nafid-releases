import { useEffect, useState } from 'react';
import { ChevronDown, FileCheck2, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../../store/authStore';
import { einvoiceApi, type BuyerEinvoiceProfile } from '../../../data/einvoice';
import { buyerProfileIssues, compactProfile, EMIRATE_OPTIONS, LEGAL_ID_TYPES, parseBuyerProfile } from '../../../utils/einvoice/einvoice';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';

const field = 'text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1 block';

/**
 * UAE only: the buyer identity a Peppol PINT AE e-invoice needs (TRN or legal ID, address, Peppol ID).
 * Saved as the synced `customers.einvoice_profile`; invoices to customers marked as a business are e-invoiced.
 */
export function CustomerEinvoicePanel({ customerId, customerGstin }: { customerId: string; customerGstin?: string | null }) {
  const { tenantId } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<BuyerEinvoiceProfile>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // The parent keys this panel by customer, so state starts fresh for each customer.
  useEffect(() => {
    let active = true;
    if (!tenantId) return;
    void einvoiceApi.getCustomerProfile({ tenant_id: tenantId, customer_id: customerId }).then(row => {
      if (!active) return;
      const parsed = parseBuyerProfile(row?.einvoice_profile);
      setProfile({ ...parsed, trn: parsed.trn ?? (customerGstin || undefined) });
      setLoaded(true);
    });
    return () => { active = false; };
  }, [tenantId, customerId, customerGstin]);

  const set = <K extends keyof BuyerEinvoiceProfile>(key: K, value: BuyerEinvoiceProfile[K]) => setProfile(prev => ({ ...prev, [key]: value }));
  const issues = buyerProfileIssues(profile);
  const isExport = !!profile.countryCode && profile.countryCode !== 'AE';

  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const result = await einvoiceApi.saveCustomerProfile({ tenant_id: tenantId, customer_id: customerId, profile: compactProfile(profile) });
      setMessage(result.success ? { text: 'Saved. It syncs to the cloud with the next sync.', ok: true } : { text: result.error ?? 'Could not save', ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border/80 rounded-2xl shadow-xs">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer">
        <FileCheck2 className="w-4 h-4 text-primary" />
        <span className="text-xs font-black uppercase tracking-wider text-foreground">E-invoicing (UAE)</span>
        <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', profile.isBusiness
          ? (issues.length ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600')
          : 'bg-muted text-muted-foreground')}>
          {!loaded ? '…' : profile.isBusiness ? (issues.length ? 'Details missing' : 'Business buyer') : 'Consumer (not e-invoiced)'}
        </span>
        <ChevronDown className={clsx('w-4 h-4 ml-auto transition-transform', open && 'rotate-180')} />
      </button>
      {open && loaded && (
        <fieldset disabled={saving} className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
          <label className="flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={!!profile.isBusiness} onChange={e => set('isBusiness', e.target.checked)} />
            This customer is a business or government buyer (sales are e-invoiced)
          </label>
          {profile.isBusiness && (
            <div className="grid grid-cols-2 gap-3">
              <div><span className={field}>Country</span>
                <Input value={profile.countryCode ?? 'AE'} maxLength={2} onChange={e => set('countryCode', e.target.value.toUpperCase())} /></div>
              {!isExport && <div><span className={field}>Buyer TRN</span>
                <Input value={profile.trn ?? ''} maxLength={15} placeholder="15-digit TRN" onChange={e => set('trn', e.target.value.replace(/\D/g, ''))} className="font-mono" /></div>}
              <div><span className={field}>Legal ID type</span>
                <Select value={profile.legalIdType ?? 'TL'} onChange={v => set('legalIdType', v as BuyerEinvoiceProfile['legalIdType'])} options={LEGAL_ID_TYPES} /></div>
              <div><span className={field}>Legal ID number</span>
                <Input value={profile.legalId ?? ''} onChange={e => set('legalId', e.target.value)} placeholder="Trade licence no." /></div>
              {(profile.legalIdType ?? 'TL') === 'TL' && <div><span className={field}>Licence issuing authority</span>
                <Input value={profile.legalIdAuthority ?? ''} onChange={e => set('legalIdAuthority', e.target.value)} placeholder="e.g. Abu Dhabi DED" /></div>}
              {profile.legalIdType === 'PAS' && <div><span className={field}>Passport country</span>
                <Input value={profile.passportCountry ?? ''} maxLength={2} onChange={e => set('passportCountry', e.target.value.toUpperCase())} /></div>}
              <div><span className={field}>Street</span>
                <Input value={profile.street ?? ''} onChange={e => set('street', e.target.value)} /></div>
              <div><span className={field}>City</span>
                <Input value={profile.city ?? ''} onChange={e => set('city', e.target.value)} /></div>
              <div><span className={field}>{isExport ? 'Region' : 'Emirate'}</span>
                {isExport
                  ? <Input value={profile.emirate ?? ''} onChange={e => set('emirate', e.target.value)} />
                  : <Select value={profile.emirate ?? ''} onChange={v => set('emirate', v)} options={EMIRATE_OPTIONS} placeholder="Select emirate" />}</div>
              <div><span className={field}>Peppol ID (optional)</span>
                <Input value={profile.peppolId ?? ''} placeholder="0235:1234567890" onChange={e => set('peppolId', e.target.value.trim())} className="font-mono" /></div>
              <label className="col-span-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={!!profile.notOnPeppol} onChange={e => set('notOnPeppol', e.target.checked)} />
                Buyer is not on e-invoicing yet (send to the FTA fallback address and also give a paper tax invoice)
              </label>
            </div>
          )}
          {profile.isBusiness && issues.length > 0 && (
            <ul className="text-[11px] text-amber-600 list-disc pl-5">{issues.map(i => <li key={i}>{i}</li>)}</ul>
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void save()} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-60">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save e-invoice details'}
            </button>
            {message && <span className={clsx('text-[11px]', message.ok ? 'text-emerald-600' : 'text-red-600')}>{message.text}</span>}
          </div>
        </fieldset>
      )}
    </div>
  );
}
