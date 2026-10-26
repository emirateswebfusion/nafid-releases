import React, { useState } from 'react';
import { FloatToast } from './ui/FloatToast';
import { useAuthStore } from '../store/authStore';
import { isAdminRole } from '../utils/permissions';
import { type ShopClosingOverviewConfig, CHECKLIST_DEFINITIONS } from '../utils/shopClosingHelper';
import { useWhatsAppSettingsState } from './whatsapp/hooks/useWhatsAppSettingsState';
import { useWhatsAppSettingsLoaders } from './whatsapp/hooks/useWhatsAppSettingsLoaders';
import { useWhatsAppConnection } from './whatsapp/hooks/useWhatsAppConnection';
import { useShopClosingConfigActions } from './whatsapp/hooks/useShopClosingConfigActions';
import { WhatsAppDisconnectDialog } from './whatsapp/views/WhatsAppDisconnectDialog';
import { WhatsAppPreferencesTab } from './whatsapp/views/WhatsAppPreferencesTab';
import { WhatsAppDeviceTab } from './whatsapp/views/WhatsAppDeviceTab';
import { ShopClosingTab } from './whatsapp/views/ShopClosingTab';
import { WhatsAppSettingsHeader } from './whatsapp/views/WhatsAppSettingsHeader';

interface WhatsAppSettingsProps {
  tenantId?: string;
  autoSendEnabled: boolean;
  onAutoSendChange: (val: boolean) => void;
  activeTab?: 'qr' | 'settings' | 'closing' | string;
  defaultTab?: 'device' | 'settings' | 'qr' | 'closing' | string;
  onTabChange?: (tab: 'qr' | 'settings' | 'closing') => void;
  closingConfig?: ShopClosingOverviewConfig;
  onClosingConfigChange?: (config: ShopClosingOverviewConfig) => void;
}

export const WhatsAppSettings: React.FC<WhatsAppSettingsProps> = ({
  tenantId,
  autoSendEnabled,
  onAutoSendChange,
  activeTab: controlledTab,
  defaultTab,
  onTabChange,
  closingConfig: propClosingConfig,
  onClosingConfigChange,
}) => {
  const { role, tenantId: storeTenantId, shopName: authShopName } = useAuthStore();
  const effectiveTenantId = tenantId || storeTenantId || 'global';
  const isAdmin = isAdminRole(role);

  const isControlledClosing = propClosingConfig !== undefined && onClosingConfigChange !== undefined;
  const wa = useWhatsAppSettingsState();
  const {
    internalClosingConfig, setInternalClosingConfig, msg, setMsg,
  } = wa;
  const closingConfig = isControlledClosing ? propClosingConfig : internalClosingConfig;

  const setClosingConfig = (newCfg: ShopClosingOverviewConfig | ((prev: ShopClosingOverviewConfig) => ShopClosingOverviewConfig)) => {
    if (isControlledClosing) {
      const next = typeof newCfg === 'function' ? newCfg(propClosingConfig) : newCfg;
      onClosingConfigChange(next);
    } else {
      setInternalClosingConfig(newCfg);
    }
  };

  const initialTab = (defaultTab === 'settings' ? 'settings' : defaultTab === 'closing' ? 'closing' : 'qr') as 'qr' | 'settings' | 'closing';
  const [internalTab, setInternalTab] = useState<'qr' | 'settings' | 'closing'>(initialTab);
  const currentTab = (controlledTab || internalTab) as 'qr' | 'settings' | 'closing';

  const handleTabSelect = (tab: 'qr' | 'settings' | 'closing') => {
    setInternalTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const [shopName, setShopName] = useState<string>(authShopName || 'My Store');

  const { loadClosingHistory } = useWhatsAppSettingsLoaders({
    wa, closingConfig, effectiveTenantId, setClosingConfig, setShopName, shopName,
  });

  const { handleToggleLedgerAlerts, handleToggleIncludeShopName, handleConnect, handleDisconnect } = useWhatsAppConnection({
    wa, effectiveTenantId,
  });

  const { handleToggleClosingFeature, handlePhoneChange, handleTimingChange, handleScheduledTimeChange, handleMultiCounterToggle, handleChecklistToggle, handleSelectAllChecklist, handleClearAllChecklist, handleRestoreDefaultChecklist, handleSaveClosingConfig, handleSendTestReport, handleRetryReport } = useShopClosingConfigActions({
    wa, closingConfig, effectiveTenantId, isAdmin, loadClosingHistory, role, setClosingConfig,
  });

  const selectedChecklistCount = Object.values(closingConfig.checklist || {}).filter(Boolean).length;
  const totalChecklistCount = CHECKLIST_DEFINITIONS.length;
  return (
    <div className="w-full space-y-6">
      {/* Header bar matching other settings sections */}
      <WhatsAppSettingsHeader
        currentTab={currentTab} wa={wa}
      />

      {/* ─── TAB 1: QR CODE / DEVICE CONNECTION ─────────────────────────────── */}
      {currentTab === 'qr' && (
        <WhatsAppDeviceTab
          handleConnect={handleConnect} handleTabSelect={handleTabSelect} wa={wa}
        />
      )}

      {/* ─── TAB 2: AUTOMATION & BILLS SETTINGS ─────────────────────────────── */}
      {currentTab === 'settings' && (
        <WhatsAppPreferencesTab
          autoSendEnabled={autoSendEnabled} handleTabSelect={handleTabSelect}
          handleToggleIncludeShopName={handleToggleIncludeShopName} handleToggleLedgerAlerts={handleToggleLedgerAlerts}
          onAutoSendChange={onAutoSendChange} shopName={shopName} wa={wa}
        />
      )}

      {/* ─── TAB 3: SHOP CLOSING OVERVIEW (END TO END) ───────────────────────── */}
      {currentTab === 'closing' && (
        <ShopClosingTab
          closingConfig={closingConfig} handleChecklistToggle={handleChecklistToggle}
          handleClearAllChecklist={handleClearAllChecklist} handleMultiCounterToggle={handleMultiCounterToggle}
          handlePhoneChange={handlePhoneChange} handleRestoreDefaultChecklist={handleRestoreDefaultChecklist}
          handleRetryReport={handleRetryReport} handleSaveClosingConfig={handleSaveClosingConfig}
          handleScheduledTimeChange={handleScheduledTimeChange} handleSelectAllChecklist={handleSelectAllChecklist}
          handleSendTestReport={handleSendTestReport} handleTabSelect={handleTabSelect}
          handleTimingChange={handleTimingChange} handleToggleClosingFeature={handleToggleClosingFeature}
          isAdmin={isAdmin} selectedChecklistCount={selectedChecklistCount} shopName={shopName}
          totalChecklistCount={totalChecklistCount} wa={wa}
        />
      )}

      {/* Custom Disconnect Confirmation Dialog */}
      <WhatsAppDisconnectDialog
        handleDisconnect={handleDisconnect} wa={wa}
      />

      {/* Floating Toast Notification */}
      <FloatToast message={msg} onClose={() => setMsg(null)} duration={3500} />
    </div>
  );
};