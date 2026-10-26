import { hasBridge } from '../../../data/client';
import { settingsApi } from '../../../data/settings';
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
  const handleToggleLedgerAlerts = async (enabled: boolean) => {
    setLedgerAlertsEnabled(enabled);
    try {
      if (hasBridge('settingsSet')) {
        await settingsApi.set({
          tenant_id: effectiveTenantId,
          key: 'ledger_whatsapp_enabled',
          value: enabled,
        });
        window.dispatchEvent(new CustomEvent('settings:updated'));
        setMsg({
          text: enabled
            ? 'Ledger WhatsApp transaction alerts enabled!'
            : 'Ledger WhatsApp transaction alerts disabled!',
          type: 'success',
        });
      }
    } catch {
      setMsg({ text: 'Failed to update alert setting', type: 'error' });
    }
  };

  const handleToggleIncludeShopName = async (include: boolean) => {
    setIncludeShopName(include);
    try {
      if (hasBridge('settingsSet')) {
        await settingsApi.set({
          tenant_id: effectiveTenantId,
          key: 'ledger_whatsapp_include_shop',
          value: include,
        });
        window.dispatchEvent(new CustomEvent('settings:updated'));
        setMsg({
          text: include
            ? 'Shop name will be included in transaction messages'
            : 'Shop name excluded from transaction messages',
          type: 'success',
        });
      }
    } catch {
      setMsg({ text: 'Failed to update shop name setting', type: 'error' });
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await whatsappApi.connect();
      if (!res.success) {
        setMsg({ text: 'Failed to initiate WhatsApp connection', type: 'error' });
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
