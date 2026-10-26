import { hasBridge } from '../../../data/client';
import { whatsappApi } from '../../../data/whatsapp';
import { type ShopClosingSendTiming, type ShopClosingChecklist, CHECKLIST_DEFINITIONS, ALL_CHECKLIST_SELECTED, ALL_CHECKLIST_CLEARED, DEFAULT_CHECKLIST, isValidPhoneNumber } from '../../../utils/shopClosingHelper';
import type { ShopClosingOverviewConfig } from '../../../utils/shopClosingHelper';
import type { WhatsAppSettingsState } from './useWhatsAppSettingsState';

export interface UseShopClosingConfigActionsContext {
  closingConfig: ShopClosingOverviewConfig;
  effectiveTenantId: string;
  isAdmin: boolean;
  loadClosingHistory: () => Promise<void>;
  role: "SUPER_ADMIN" | "ADMIN" | "STAFF" | null;
  setClosingConfig: (newCfg: ShopClosingOverviewConfig | ((prev: ShopClosingOverviewConfig) => ShopClosingOverviewConfig)) => void;
  wa: WhatsAppSettingsState;
}

/** Shop closing report settings: master switch, phone, timing, checklist edits, save, test send and retry. */
export function useShopClosingConfigActions(ctx: UseShopClosingConfigActionsContext) {
  const { closingConfig, effectiveTenantId, isAdmin, loadClosingHistory, role, setClosingConfig } = ctx;
  const { setMsg, setRetryingId, setSavingClosing, setSendingTest, status } = ctx.wa;
  // ── Shop Closing Overview Handlers ───────────────────────────────────────
  const handleToggleClosingFeature = async (enabled: boolean) => {
    if (!isAdmin) {
      setMsg({ text: 'Admin privileges required to change this setting.', type: 'error' });
      return;
    }
    const updated = { ...closingConfig, enabled };
    setClosingConfig(updated);

    // Auto-persist toggle immediately to database so that even if the page is reopened without pressing Save,
    // the enabled/disabled state is permanently persisted!
    try {
      if (hasBridge('shopClosingSaveConfig')) {
        await whatsappApi.shopClosingSaveConfig({
          tenant_id: effectiveTenantId,
          config: updated,
          user_role: role as string | undefined,
        });
      }
    } catch (err) {
      console.error('[WhatsAppSettings] Auto-save toggle error:', err);
    }
  };

  const handlePhoneChange = (val: string) => {
    setClosingConfig((prev) => ({ ...prev, ownerPhone: val }));
  };

  const handleTimingChange = (timing: ShopClosingSendTiming) => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, sendTiming: timing }));
  };

  const handleScheduledTimeChange = (time: string) => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, scheduledTime: time }));
  };

  const handleMultiCounterToggle = (include: boolean) => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, includeMultiCounterBreakdown: include }));
  };

  const handleChecklistToggle = (key: keyof ShopClosingChecklist) => {
    if (!isAdmin) return;
    setClosingConfig((prev) => {
      const nextVal = !prev.checklist[key];
      const newChecklist = { ...prev.checklist, [key]: nextVal };

      // If user toggled a parent group header (e.g. paymentMethods or sales), also sync all its children
      const children = CHECKLIST_DEFINITIONS.filter((def) => def.parentKey === key);
      if (children.length > 0) {
        children.forEach((child) => {
          newChecklist[child.key] = nextVal;
        });
      }

      // If user turned on a child option, ensure its parent group toggle is also enabled
      const currentDef = CHECKLIST_DEFINITIONS.find((def) => def.key === key);
      if (currentDef && currentDef.parentKey && nextVal === true) {
        newChecklist[currentDef.parentKey] = true;
      }

      return {
        ...prev,
        checklist: newChecklist,
      };
    });
  };

  const handleSelectAllChecklist = () => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, checklist: ALL_CHECKLIST_SELECTED }));
  };

  const handleClearAllChecklist = () => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, checklist: ALL_CHECKLIST_CLEARED }));
  };

  const handleRestoreDefaultChecklist = () => {
    if (!isAdmin) return;
    setClosingConfig((prev) => ({ ...prev, checklist: DEFAULT_CHECKLIST }));
  };

  const handleSaveClosingConfig = async () => {
    if (!isAdmin) {
      setMsg({ text: 'Permission denied: Store Admin or Owner access required.', type: 'error' });
      return;
    }
    if (closingConfig.enabled && !isValidPhoneNumber(closingConfig.ownerPhone)) {
      setMsg({ text: 'Please enter a valid owner WhatsApp phone number before enabling.', type: 'error' });
      return;
    }

    setSavingClosing(true);
    try {
      if (hasBridge('shopClosingSaveConfig')) {
        const res = await whatsappApi.shopClosingSaveConfig({
          tenant_id: effectiveTenantId,
          config: closingConfig,
          user_role: role as string | undefined,
        });

        if (res && res.success) {
          setMsg({ text: 'Shop Closing Overview settings saved successfully!', type: 'success' });
          if (res.config) setClosingConfig(res.config);
        } else {
          setMsg({ text: res?.error || 'Failed to save settings.', type: 'error' });
        }
      }
    } catch (err) {
      setMsg({ text: (err as { message?: string } | null)?.message || 'Error saving settings.', type: 'error' });
    } finally {
      setSavingClosing(false);
    }
  };

  const handleSendTestReport = async () => {
    if (!isValidPhoneNumber(closingConfig.ownerPhone)) {
      setMsg({ text: 'Please enter a valid owner WhatsApp phone number first.', type: 'error' });
      return;
    }
    if (status !== 'connected') {
      setMsg({ text: 'WhatsApp device is not connected. Please scan QR in the QR tab.', type: 'error' });
      return;
    }

    setSendingTest(true);
    try {
      if (hasBridge('shopClosingSendReport')) {
        const res = await whatsappApi.shopClosingSendReport({
          tenant_id: effectiveTenantId,
          trigger_type: 'MANUAL',
          force: true,
          custom_phone: closingConfig.ownerPhone,
          custom_checklist: closingConfig.checklist,
        });

        if (res && res.success) {
          setMsg({ text: `Test report dispatched successfully to ${closingConfig.ownerPhone}!`, type: 'success' });
          loadClosingHistory();
        } else {
          setMsg({ text: res?.error || 'Failed to send test report.', type: 'error' });
        }
      }
    } catch (err) {
      setMsg({ text: (err as { message?: string } | null)?.message || 'Dispatch error occurred.', type: 'error' });
    } finally {
      setSendingTest(false);
    }
  };

  const handleRetryReport = async (reportId: string) => {
    setRetryingId(reportId);
    try {
      if (hasBridge('shopClosingRetry')) {
        const res = await whatsappApi.shopClosingRetry({ report_id: reportId });
        if (res && res.success) {
          setMsg({ text: 'Report retry sent successfully!', type: 'success' });
          loadClosingHistory();
        } else {
          setMsg({ text: res?.error || 'Retry attempt failed.', type: 'error' });
        }
      }
    } catch (err) {
      setMsg({ text: (err as { message?: string } | null)?.message || 'Retry error.', type: 'error' });
    } finally {
      setRetryingId(null);
    }
  };

  return { handleToggleClosingFeature, handlePhoneChange, handleTimingChange, handleScheduledTimeChange, handleMultiCounterToggle, handleChecklistToggle, handleSelectAllChecklist, handleClearAllChecklist, handleRestoreDefaultChecklist, handleSaveClosingConfig, handleSendTestReport, handleRetryReport };
}
