import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../../../data/settings';
import { listParties } from '../../../data/parties';
import { parseBillFormats, getPartyMessageTypes, type BillFormat } from '../../../utils/print/whatsappSharing';

/** Customer bill formats and ledger-alert party types; every change is saved immediately. */
export function useWhatsAppSharingChoices(tenantId: string) {
  const [formats, setFormats] = useState<BillFormat[]>(['text', 'a4']);
  const [types, setTypes] = useState<string[]>([]);
  /** null = all party types, including ones added later. */
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
    }).catch((err: unknown) => { if (active) { setError(err instanceof Error ? err.message : String(err)); setBusy(true); } });
    return () => { active = false; };
  }, [tenantId]);
  async function save(key: string, value: unknown, apply: () => void) {
    setBusy(true); setError('');
    try { await setSetting({ tenant_id: tenantId, key, value }); apply(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  const toggleFormat = (format: BillFormat, on: boolean) => {
    const next = on ? [...formats, format] : formats.filter(f => f !== format);
    if (next.length) void save('whatsapp_bill_formats', next, () => setFormats(next));
  };
  const toggleAllTypes = (on: boolean) => {
    const next = on ? null : [];
    void save('ledger_whatsapp_party_types', next, () => setSelected(next));
  };
  const toggleType = (type: string, on: boolean) => {
    const current = selected ?? types;
    const next = on ? [...current, type] : current.filter(t => t !== type);
    void save('ledger_whatsapp_party_types', next, () => setSelected(next));
  };
  return { formats, types, selected, busy, error, toggleFormat, toggleAllTypes, toggleType };
}

export type WhatsAppSharingChoicesState = ReturnType<typeof useWhatsAppSharingChoices>;
