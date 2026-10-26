import { WhatsAppIcon } from '../../ui/WhatsAppIcon';
import { Loader2, RefreshCw } from 'lucide-react';
import type { WhatsAppSettingsState } from '../hooks/useWhatsAppSettingsState';

export interface WhatsAppSettingsHeaderProps {
  currentTab: "qr" | "settings" | "closing";
  wa: WhatsAppSettingsState;
}

/** Header bar: title and the device / preferences / shop closing tab buttons. */
export function WhatsAppSettingsHeader({
  currentTab, wa,
}: WhatsAppSettingsHeaderProps) {
  const { phone, status } = wa;
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-border">
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold shrink-0 border border-emerald-500/20 shadow-xs">
          <WhatsAppIcon className="w-6 h-6 text-emerald-500 fill-current" />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
            {currentTab === 'qr'
              ? 'WhatsApp Device Connection'
              : currentTab === 'closing'
              ? 'Shop Closing Overview'
              : 'WhatsApp Automation & Alerts'}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentTab === 'qr'
              ? 'Scan the QR code to link your shop phone for automated invoice & ledger messaging'
              : currentTab === 'closing'
              ? 'Configure automated end-of-day sales, cash reconciliation & multi-counter reports to the shop owner'
              : 'Configure automated PDF bill dispatch and party ledger transaction alert rules'}
          </p>
        </div>
      </div>

      {/* Real-time Status Badge */}
      <div className="flex items-center gap-2 shrink-0">
        {status === 'connected' ? (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Connected (+{phone || 'Ready'})
          </span>
        ) : status === 'syncing' ? (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Syncing Session...
          </span>
        ) : status === 'connecting' ? (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Waiting for Scan...
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            Not Connected
          </span>
        )}
      </div>
    </div>
  );
}
