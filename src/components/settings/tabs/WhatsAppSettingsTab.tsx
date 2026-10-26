import React from 'react';
import { QrCode, Settings, Store } from 'lucide-react';
import clsx from 'clsx';
import { WhatsAppSettings } from '../../WhatsAppSettings';
import type { ShopClosingOverviewConfig } from '../../../utils/shopClosingHelper';

export interface WhatsAppSettingsTabProps {
  tenantId?: string;
  autoWhatsAppSend: boolean;
  setAutoWhatsAppSend: (val: boolean) => void;
  activeWhatsAppTab: 'qr' | 'settings' | 'closing';
  setActiveWhatsAppTab: (val: 'qr' | 'settings' | 'closing') => void;
  shopClosingConfig: ShopClosingOverviewConfig;
  setShopClosingConfig: (cfg: ShopClosingOverviewConfig) => void;
}

export const WhatsAppSettingsTab: React.FC<WhatsAppSettingsTabProps> = ({
  tenantId,
  autoWhatsAppSend,
  setAutoWhatsAppSend,
  activeWhatsAppTab,
  setActiveWhatsAppTab,
  shopClosingConfig,
  setShopClosingConfig,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Sub-tabs */}
      <div className="flex gap-1.5 p-1.5 bg-muted/50 dark:bg-muted/20 border border-border rounded-2xl overflow-x-auto scrollbar-none w-full max-w-fit shadow-inner mx-auto">
        {[
          { id: 'qr', label: 'Device / QR', icon: QrCode },
          { id: 'settings', label: 'Automations & Bills', icon: Settings },
          { id: 'closing', label: 'Shop Closing Overview', icon: Store },
        ].map((tab) => {
          const Icon = tab.icon;
          const isTabActive = activeWhatsAppTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveWhatsAppTab(tab.id as 'qr' | 'settings' | 'closing')}
              className={clsx(
                "flex items-center justify-center gap-2 py-2 px-5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer border border-transparent shrink-0",
                isTabActive
                  ? "bg-background shadow-md shadow-foreground/[0.03] text-primary border-border/40 font-extrabold scale-100"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="w-4 h-4 shrink-0 text-current" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content card matching other sections */}
      <div className="bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm">
        <WhatsAppSettings
          tenantId={tenantId}
          autoSendEnabled={autoWhatsAppSend}
          activeTab={activeWhatsAppTab}
          onTabChange={setActiveWhatsAppTab}
          closingConfig={shopClosingConfig}
          onClosingConfigChange={setShopClosingConfig}
          onAutoSendChange={(val) => {
            setAutoWhatsAppSend(val);
            localStorage.setItem('auto_whatsapp_send', val ? 'true' : 'false');
          }}
        />
      </div>
    </div>
  );
};
