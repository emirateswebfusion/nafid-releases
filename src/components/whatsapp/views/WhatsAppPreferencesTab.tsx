import React from 'react';
import clsx from 'clsx';
import { AlertCircle, BookOpen, CheckCircle2, ChevronRight, Send, Store } from 'lucide-react';
import { SwitchField } from '../../settings/views/SettingsControls';
import { useWhatsAppSharingChoices } from '../hooks/useWhatsAppSharingChoices';
import { BillFormatPicker, LedgerRecipientPicker, SharingSaveError } from './WhatsAppSharingChoices';
import type { WhatsAppSettingsState } from '../hooks/useWhatsAppSettingsState';

export interface WhatsAppPreferencesTabProps {
  autoSendEnabled: boolean;
  handleTabSelect: (tab: "qr" | "settings" | "closing") => void;
  handleToggleIncludeShopName: (include: boolean) => Promise<void>;
  handleToggleLedgerAlerts: (enabled: boolean) => Promise<void>;
  onAutoSendChange: (val: boolean) => void;
  shopName: string;
  tenantId: string;
  wa: WhatsAppSettingsState;
}

function Panel({ icon: Icon, title, subtitle, badge, children }: {
  icon: typeof Send; title: string; subtitle: string; badge?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="p-5 md:p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="w-4.5 h-4.5" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-foreground">{title}</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

function OnOffBadge({ on }: { on: boolean }) {
  return (
    <span className={clsx('text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0',
      on ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border')}>
      {on ? 'ON' : 'OFF'}
    </span>
  );
}

/** Automations & Bills tab: customer bills sent on checkout and ledger transaction alerts. Changes save immediately. */
export function WhatsAppPreferencesTab({
  autoSendEnabled, handleTabSelect, handleToggleIncludeShopName, handleToggleLedgerAlerts, onAutoSendChange,
  shopName, tenantId, wa,
}: WhatsAppPreferencesTabProps) {
  const { includeShopName, ledgerAlertsEnabled, status } = wa;
  const sharing = useWhatsAppSharingChoices(tenantId);
  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {status !== 'connected' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
          <div className="flex items-start gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>WhatsApp is not connected.</strong> Messages start sending once you link the shop phone.
            </span>
          </div>
          <button type="button" onClick={() => handleTabSelect('qr')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 shrink-0 cursor-pointer">
            Connect device <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <SharingSaveError error={sharing.error} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Panel icon={Send} title="Customer Bills" subtitle="Send the bill to the customer's WhatsApp after checkout" badge={<OnOffBadge on={autoSendEnabled} />}>
          <SwitchField id="wa-auto-send" label="Auto-send WhatsApp Bill on Checkout"
            description="When a customer phone number is entered during billing, the bill is sent automatically in the formats below."
            checked={autoSendEnabled} onChange={onAutoSendChange} />
          <BillFormatPicker sharing={sharing} />
          <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mb-1.5">The customer also gets</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {['Itemised purchase summary', 'Credit period & due date (credit bills)', 'Live ledger balance'].map(item => (
                <li key={item} className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />{item}</li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel icon={BookOpen} title="Ledger Transaction Alerts" subtitle="Instant message to the party on Got Cash / Gave Cash entries" badge={<OnOffBadge on={ledgerAlertsEnabled} />}>
          <SwitchField id="wa-ledger-alerts" label="Send WhatsApp Alert on Ledger Transactions"
            description={ledgerAlertsEnabled
              ? 'On for the party types below. You can silence a single party from its ledger profile.'
              : 'Off for all parties. No transaction messages are sent.'}
            checked={ledgerAlertsEnabled} onChange={v => void handleToggleLedgerAlerts(v)} />
          <SwitchField id="wa-include-shop-name" label="Include Shop Name in Message"
            description={<>Adds &ldquo;— *{shopName}*&rdquo; at the bottom of each alert.</>}
            checked={includeShopName} disabled={!ledgerAlertsEnabled} onChange={v => void handleToggleIncludeShopName(v)} />
          <LedgerRecipientPicker sharing={sharing} disabled={!ledgerAlertsEnabled} />
        </Panel>
      </div>

      <button type="button" onClick={() => handleTabSelect('closing')}
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 hover:border-emerald-500/40 transition-all text-left cursor-pointer group">
        <span className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0"><Store className="w-4.5 h-4.5" /></span>
        <span className="flex-1 min-w-0">
          <span className="text-xs font-bold text-foreground block">Daily shop closing report</span>
          <span className="text-[11px] text-muted-foreground block">Send end-of-day sales, cash and counter reports to the owner&apos;s WhatsApp.</span>
        </span>
        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
          Set up <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </button>

      <p className="text-[11px] text-muted-foreground text-center">Changes on this tab are saved immediately.</p>
    </div>
  );
}
