import { Smartphone, Settings2, ShoppingCart, Wallet, History, Layers } from 'lucide-react';
import clsx from 'clsx';
import type { UpiPageConfig } from '../../../utils/print/upiConfig';
import type { PaymentMethodsState } from '../hooks/usePaymentMethodsState';

export interface UpiPageSettingsProps {
  handleToggleUpiPage: (pageKey: keyof UpiPageConfig) => Promise<void>;
  pmState: PaymentMethodsState;
}

/** Owner settings: on which pages (billing, receipts, ...) the UPI payment details are shown. */
export function UpiPageSettings({
  handleToggleUpiPage, pmState,
}: UpiPageSettingsProps) {
  const { sources, upiPageConfig } = pmState;
  return (
    <div className="bg-card/70 dark:bg-card/40 border border-border/60 p-6 rounded-3xl backdrop-blur-md shadow-sm space-y-5 mt-8 select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-inner">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-foreground tracking-tight">
              UPI Details – Page-wise Configuration
            </h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Enable or disable displaying the configured UPI ID list when UPI payment method is selected on each page.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-xl border border-border/50">
          <Settings2 className="w-4 h-4 text-primary" />
          <span>{sources.filter(s => s.type === 'UPI' && s.is_enabled === 1).length} Active UPI Accounts Configured</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          {
            key: 'billing' as const,
            title: 'Billing Page',
            desc: 'Displays the UPI account selection list when UPI payment is selected during POS billing checkout.',
            icon: ShoppingCart,
            badge: 'POS Checkout',
          },
          {
            key: 'settlement' as const,
            title: 'Cash Settlement Page',
            desc: 'Displays the UPI account selection list when UPI payment is selected during cash register drawer settlement.',
            icon: Wallet,
            badge: 'Cash Drawer',
          },
          {
            key: 'sales_history' as const,
            title: 'Sales History Page',
            desc: 'Displays the UPI account selection list when collecting due payments for credit invoices in Sales History.',
            icon: History,
            badge: 'Collect Payment',
          },
          {
            key: 'scrap' as const,
            title: 'Scrap Manager Page',
            desc: 'Displays the UPI account selection list when paying or receiving funds via UPI in Scrap Manager.',
            icon: Layers,
            badge: 'Scrap Payouts',
          },
          {
            key: 'mobile_billing' as const,
            title: 'Mobile Billing Page',
            desc: 'Displays the UPI account selection list when UPI payment is selected on the Mobile App billing screen.',
            icon: Smartphone,
            badge: 'Mobile POS',
          },
        ].map((item) => {
          const isEnabled = upiPageConfig[item.key];
          const ItemIcon = item.icon;

          return (
            <div
              key={item.key}
              className={clsx(
                'p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between space-y-4',
                isEnabled
                  ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/30 shadow-sm'
                  : 'bg-muted/30 border-border/60 opacity-80'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'p-2.5 rounded-xl border',
                    isEnabled
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-muted text-muted-foreground border-border'
                  )}>
                    <ItemIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-foreground">{item.title}</h4>
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      {item.badge}
                    </span>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  onClick={() => handleToggleUpiPage(item.key)}
                  className={clsx(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
                    isEnabled ? 'bg-emerald-600' : 'bg-muted-foreground/30'
                  )}
                  title={`Toggle UPI details for ${item.title}`}
                >
                  <span
                    className={clsx(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                {item.desc}
              </p>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-bold">
                <span className="text-muted-foreground">UPI Selection List:</span>
                <span className={clsx(
                  'px-2 py-0.5 rounded-full font-black uppercase tracking-wider',
                  isEnabled
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {isEnabled ? 'ON (Displayed)' : 'OFF (Hidden)'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
