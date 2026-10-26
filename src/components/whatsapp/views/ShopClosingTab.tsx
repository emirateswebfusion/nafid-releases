import { ShieldAlert, AlertCircle } from 'lucide-react';
import { ClosingEnableSection } from './ClosingEnableSection';
import { ClosingTimingSection } from './ClosingTimingSection';
import { ClosingChecklistSection } from './ClosingChecklistSection';
import { ClosingPreviewPanel } from './ClosingPreviewPanel';
import { ClosingHistoryPanel } from './ClosingHistoryPanel';
import type { ShopClosingSendTiming, ShopClosingChecklist } from '../../../utils/shopClosingHelper';
import type { ShopClosingOverviewConfig } from '../../../utils/shopClosingHelper';
import type { WhatsAppSettingsState } from '../hooks/useWhatsAppSettingsState';

export interface ShopClosingTabProps {
  closingConfig: ShopClosingOverviewConfig;
  handleChecklistToggle: (key: keyof ShopClosingChecklist) => void;
  handleClearAllChecklist: () => void;
  handleMultiCounterToggle: (include: boolean) => void;
  handlePhoneChange: (val: string) => void;
  handleRestoreDefaultChecklist: () => void;
  handleRetryReport: (reportId: string) => Promise<void>;
  handleSaveClosingConfig: () => Promise<void>;
  handleScheduledTimeChange: (time: string) => void;
  handleSelectAllChecklist: () => void;
  handleSendTestReport: () => Promise<void>;
  handleTabSelect: (tab: "qr" | "settings" | "closing") => void;
  handleTimingChange: (timing: ShopClosingSendTiming) => void;
  handleToggleClosingFeature: (enabled: boolean) => Promise<void>;
  isAdmin: boolean;
  selectedChecklistCount: number;
  shopName: string;
  totalChecklistCount: number;
  wa: WhatsAppSettingsState;
}

/** Shop closing report tab: intro banner, settings sections, live preview and delivery history. */
export function ShopClosingTab({
  closingConfig, handleChecklistToggle, handleClearAllChecklist, handleMultiCounterToggle, handlePhoneChange,
  handleRestoreDefaultChecklist, handleRetryReport, handleSaveClosingConfig, handleScheduledTimeChange,
  handleSelectAllChecklist, handleSendTestReport, handleTabSelect, handleTimingChange, handleToggleClosingFeature,
  isAdmin, selectedChecklistCount, shopName, totalChecklistCount, wa,
}: ShopClosingTabProps) {
  const { status } = wa;
  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* Admin Guard Notice */}
      {!isAdmin && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <div className="text-xs leading-relaxed">
            <strong>Administrator Access Required:</strong> Only the Store Owner or Admin can configure or modify WhatsApp Shop Closing Overview settings.
          </div>
        </div>
      )}

      {/* Connection warning if WhatsApp is not connected */}
      {status !== 'connected' && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
          <div className="flex items-center gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              <strong>WhatsApp is disconnected:</strong> Scheduled and settlement reports will automatically deliver once WhatsApp is connected in the <strong>QR</strong> tab.
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleTabSelect('qr')}
            className="text-xs font-bold underline shrink-0 cursor-pointer"
          >
            Connect Now &rarr;
          </button>
        </div>
      )}

      {/* Main Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
        {/* Left 7 Columns: Settings, Recipient & Checklist */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Master Enable & Phone Number */}
          <ClosingEnableSection
            closingConfig={closingConfig} handlePhoneChange={handlePhoneChange}
            handleToggleClosingFeature={handleToggleClosingFeature} isAdmin={isAdmin}
          />

          {/* Card 2: Dispatch Timing & Triggers */}
          <ClosingTimingSection
            closingConfig={closingConfig} handleMultiCounterToggle={handleMultiCounterToggle}
            handleScheduledTimeChange={handleScheduledTimeChange} handleTimingChange={handleTimingChange}
            isAdmin={isAdmin}
          />

          {/* Card 3: Customizable Information Checklist */}
          <ClosingChecklistSection
            closingConfig={closingConfig} handleChecklistToggle={handleChecklistToggle}
            handleClearAllChecklist={handleClearAllChecklist}
            handleRestoreDefaultChecklist={handleRestoreDefaultChecklist}
            handleSelectAllChecklist={handleSelectAllChecklist} isAdmin={isAdmin}
            selectedChecklistCount={selectedChecklistCount} totalChecklistCount={totalChecklistCount}
          />
        </div>

        {/* Right 5 Columns: WhatsApp Chat Live Preview & Actions */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card: Live WhatsApp Preview */}
          <ClosingPreviewPanel
            closingConfig={closingConfig} handleSaveClosingConfig={handleSaveClosingConfig}
            handleSendTestReport={handleSendTestReport} isAdmin={isAdmin} shopName={shopName} wa={wa}
          />

          {/* Card: Delivery History Log Accordion */}
          <ClosingHistoryPanel
            handleRetryReport={handleRetryReport} wa={wa}
          />
        </div>
      </div>
    </div>
  );
}
