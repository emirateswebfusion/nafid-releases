import { useState } from 'react';
import { useSettingsSectionSave } from '../../settings/hooks/useSettingsSectionSave';
import { setSetting } from '../../../data/settings';
import { whatsappApi } from '../../../data/whatsapp';
import type { WhatsAppSettingsState } from './useWhatsAppSettingsState';

export interface UseWhatsAppConnectionContext {
  effectiveTenantId: string;
  wa: WhatsAppSettingsState;
}

/** Ledger alert toggles and linking / unlinking the WhatsApp device. */
export function useWhatsAppConnection(ctx: UseWhatsAppConnectionContext) {
  const { effectiveTenantId } = ctx;
  const { setIncludeShopName, setLedgerAlertsEnabled, setLoading, setMsg, setPhone, setQrCode, setShowConfirmDisconnect, setStatus } = ctx.wa;
  const [baseline, setBaseline] = useState<string | null>(null);
  const snapshot = JSON.stringify([ctx.wa.ledgerAlertsEnabled, ctx.wa.includeShopName]);
  const dirty = baseline !== null && snapshot !== baseline;
  useSettingsSectionSave(dirty, async () => {
    await setSetting({ tenant_id: effectiveTenantId, key: 'ledger_whatsapp_enabled', value: ctx.wa.ledgerAlertsEnabled });
    await setSetting({ tenant_id: effectiveTenantId, key: 'ledger_whatsapp_include_shop', value: ctx.wa.includeShopName });
    setBaseline(null);
  });
  const handleToggleLedgerAlerts = async (enabled: boolean) => { setBaseline(current => current ?? snapshot); setLedgerAlertsEnabled(enabled); };
  const handleToggleIncludeShopName = async (include: boolean) => { setBaseline(current => current ?? snapshot); setIncludeShopName(include); };

  const handleConnect = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await whatsappApi.connect();
      if (!res.success) {
        setMsg({ text: res.error || 'Failed to initiate WhatsApp connection', type: 'error' });
      }
    } catch (err) {
      setMsg({ text: (err as { message?: string } | null)?.message || 'Connection error', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setShowConfirmDisconnect(false);
    setLoading(true);
    try {
      await whatsappApi.disconnect();
      setStatus('disconnected');
      setQrCode(null);
      setPhone(null);
      setMsg({ text: 'WhatsApp disconnected successfully', type: 'success' });
    } catch (err) {
      setMsg({ text: (err as { message?: string } | null)?.message || 'Disconnect error', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return { handleToggleLedgerAlerts, handleToggleIncludeShopName, handleConnect, handleDisconnect };
}
