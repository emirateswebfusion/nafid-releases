import { AlertCircle, Store, ShieldCheck, BookOpen } from 'lucide-react';
import { Button } from '../../ui/Button';
import clsx from 'clsx';
import type { WhatsAppSettingsState } from '../hooks/useWhatsAppSettingsState';

export interface WhatsAppPreferencesTabProps {
  autoSendEnabled: boolean;
  handleTabSelect: (tab: "qr" | "settings" | "closing") => void;
  handleToggleIncludeShopName: (include: boolean) => Promise<void>;
  handleToggleLedgerAlerts: (enabled: boolean) => Promise<void>;
  onAutoSendChange: (val: boolean) => void;
  shopName: string;
  wa: WhatsAppSettingsState;
}

/** Preferences tab: invoice auto-send and ledger alert options. */
export function WhatsAppPreferencesTab({
  autoSendEnabled, handleTabSelect, handleToggleIncludeShopName, handleToggleLedgerAlerts, onAutoSendChange,
  shopName, wa,
}: WhatsAppPreferencesTabProps) {
  const { includeShopName, ledgerAlertsEnabled, status } = wa;
  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {status !== 'connected' && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
          <div className="flex items-center gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Device not connected:</strong> Automated messages will begin sending once you link your WhatsApp number in the <strong>QR</strong> tab.
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleTabSelect('qr')}
            className="text-xs font-bold underline shrink-0 cursor-pointer"
          >
            Open QR Tab &rarr;
          </button>
        </div>
      )}

      {/* Quick link banner to Shop Closing Overview */}
      <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div className="text-left">
            <span className="text-xs font-bold text-foreground block">Looking for Daily Shop Closing Reports?</span>
            <span className="text-[11px] text-muted-foreground block">
              Automatically send end-of-day sales, cash balances, and counter reports to the shop owner&apos;s WhatsApp.
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleTabSelect('closing')}
          className="text-xs font-bold px-4 py-1.5 rounded-xl border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
        >
          Configure Closing Overview &rarr;
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full items-start">
        {/* Column 1: Automated Bill Options */}
        <div className="p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                Automated Checkout Bills
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Send digital receipts to customer phones on checkout
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:border-border transition-colors">
            <div className="space-y-0.5 pr-4 text-left">
              <span className="text-xs font-bold text-foreground block">
                Auto-send WhatsApp Bill on Checkout
              </span>
              <span className="text-[11px] text-muted-foreground block leading-snug">
                When a customer phone number is entered during billing, automatically send the bill in the selected formats.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
              <input
                type="checkbox"
                checked={autoSendEnabled}
                onChange={(e) => onAutoSendChange(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
            </label>
          </div>

          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
            <h5 className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              What does the customer receive?
            </h5>
            <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc list-inside leading-snug">
              <li>The selected bill formats (text, invoice PDF, or receipt PDF)</li>
              <li>Itemized purchase summary (descriptions, quantities &amp; totals)</li>
              <li>Credit period &amp; Due date reminder (for credit invoices)</li>
              <li>Live ledger balance summary</li>
            </ul>
          </div>
        </div>

        {/* Column 2: Ledger Transaction Alerts */}
        <div className="p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                  Ledger Transaction Alerts
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Instant WhatsApp alerts on Got Cash / Gave Cash entries
                </p>
              </div>
            </div>

            <span
              className={clsx(
                'text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition-colors',
                ledgerAlertsEnabled
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-muted text-muted-foreground border-border'
              )}
            >
              {ledgerAlertsEnabled ? 'Active (Enabled)' : 'Disabled (Off)'}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:border-border transition-colors">
            <div className="space-y-0.5 pr-4 text-left">
              <span className="text-xs font-bold text-foreground block">
                Send WhatsApp Alert on Ledger Transactions
              </span>
              <span className="text-[11px] text-muted-foreground block leading-snug">
                {ledgerAlertsEnabled
                  ? 'Active for selected party types. You can silence individual parties from their ledger profile.'
                  : 'Turned off for all parties. No automated transaction messages will be sent.'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
              <input
                type="checkbox"
                checked={ledgerAlertsEnabled}
                onChange={(e) => handleToggleLedgerAlerts(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 shadow-inner"></div>
            </label>
          </div>

          <div
            className={clsx(
              'flex items-center justify-between p-4 rounded-xl border transition-all',
              ledgerAlertsEnabled
                ? 'bg-card border-border/60 hover:border-border'
                : 'bg-muted/15 border-border/40 opacity-60 pointer-events-none'
            )}
          >
            <div className="space-y-0.5 pr-4 text-left">
              <span className="text-xs font-bold text-foreground block">
                Include Shop Name in Message
              </span>
              <span className="text-[11px] text-muted-foreground block leading-snug">
                Appends &ldquo;— *{shopName}*&rdquo; at the bottom of the notification.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
              <input
                type="checkbox"
                checked={includeShopName}
                disabled={!ledgerAlertsEnabled}
                onChange={(e) => handleToggleIncludeShopName(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary shadow-inner"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
