import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../../../data/settings';
import { listParties } from '../../../data/parties';
import { parseBillFormats, getPartyMessageTypes, type BillFormat } from '../../../utils/print/whatsappSharing';

export function WhatsAppSharingChoices({ tenantId }: { tenantId: string }) {
  const [formats, setFormats] = useState<BillFormat[]>(['text', 'a4']);
  const [types, setTypes] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([
      getSetting({ tenant_id: tenantId, key: 'whatsapp_bill_formats' }),
      getSetting({ tenant_id: tenantId, key: 'ledger_whatsapp_party_types' }),
      listParties(tenantId),
    ]).then(([billFormats, partyTypes, parties]) => {
      if (!active) return;
      setFormats(parseBillFormats(billFormats));
      const parsed: unknown = typeof partyTypes === 'string' ? JSON.parse(partyTypes) : partyTypes;
      setSelected(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null);
      setTypes(getPartyMessageTypes(parties));
      setBusy(false);
    }).catch((err: unknown) => { if (active) { setError(String(err)); setBusy(true); } });
    return () => { active = false; };
  }, [tenantId]);
  async function save(key: string, value: unknown, apply: () => void) {
    setBusy(true); setError('');
    try { await setSetting({ tenant_id: tenantId, key, value }); apply(); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4 rounded-xl border border-border p-4">
    <fieldset disabled={busy} className="space-y-2">
      <legend className="font-bold">Customer bill formats</legend>
      {(['text', 'a4', 'thermal'] as const).map(format => <label key={format} className="flex gap-2">
        <input type="checkbox" checked={formats.includes(format)} onChange={e => {
          const next = e.target.checked ? [...formats, format] : formats.filter(f => f !== format);
          if (next.length) void save('whatsapp_bill_formats', next, () => setFormats(next));
        }} />{format === 'text' ? 'Text message' : format === 'a4' ? 'A4 PDF' : 'Thermal receipt PDF'}
      </label>)}
      <p className="text-xs text-muted-foreground">Choose at least one format. Applies to active bills, checkout, and saved sales bills.</p>
    </fieldset>
    <fieldset disabled={busy} className="space-y-2">
      <legend className="font-bold">Ledger WhatsApp recipient types</legend>
      <label className="flex gap-2"><input type="checkbox" checked={selected === null} onChange={e => {
        const next = e.target.checked ? null : [];
        void save('ledger_whatsapp_party_types', next, () => setSelected(next));
      }} />All types, including newly added types</label>
      {types.map(type => <label key={type} className="flex gap-2"><input type="checkbox" checked={selected === null || selected.includes(type)} onChange={e => {
        const current = selected ?? types;
        const next = e.target.checked ? [...current, type] : current.filter(t => t !== type);
        void save('ledger_whatsapp_party_types', next, () => setSelected(next));
      }} />{type}</label>)}
      {!types.length && <p>No party types available. Add parties to populate this list.</p>}
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </div>;
}
