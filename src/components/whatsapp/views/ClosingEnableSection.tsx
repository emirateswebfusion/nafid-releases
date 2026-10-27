import { Store, Phone } from 'lucide-react';
import clsx from 'clsx';
import { isValidPhoneNumber } from '../../../utils/time/shopClosingHelper';
import type { ShopClosingOverviewConfig } from '../../../utils/time/shopClosingHelper';

export interface ClosingEnableSectionProps {
  closingConfig: ShopClosingOverviewConfig;
  handlePhoneChange: (val: string) => void;
  handleToggleClosingFeature: (enabled: boolean) => Promise<void>;
  isAdmin: boolean;
}

/** Shop closing report master switch and recipient phone number. */
export function ClosingEnableSection({
  closingConfig, handlePhoneChange, handleToggleClosingFeature, isAdmin,
}: ClosingEnableSectionProps) {
  return (
    <div className="p-6 rounded-2xl bg-muted/20 border border-border/80 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
              Shop Closing Overview Alert
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Daily WhatsApp business summary sent directly to the store owner
            </p>
          </div>
        </div>

        <span
          className={clsx(
            'text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition-colors',
            closingConfig.enabled
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-muted text-muted-foreground border-border'
          )}
        >
          {closingConfig.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {/* Master Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/60 hover:border-border transition-colors">
        <div className="space-y-0.5 pr-4 text-left">
          <span className="text-xs font-bold text-foreground block">
            Enable Shop Closing WhatsApp Reports
          </span>
          <span className="text-[11px] text-muted-foreground block leading-snug">
            Generate accurate financial summary from local POS transactions and dispatch directly to the owner.
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0 select-none">
          <input
            type="checkbox"
            checked={closingConfig.enabled}
            disabled={!isAdmin}
            onChange={(e) => handleToggleClosingFeature(e.target.checked)}
            className="sr-only peer"
          />
          <div className={clsx(
            "w-11 h-6 bg-muted/80 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 shadow-inner",
            !isAdmin && "opacity-50 cursor-not-allowed"
          )}></div>
        </label>
      </div>

      {/* Owner's Phone Number Input */}
      <div
        className={clsx(
          'p-4 rounded-xl bg-card border border-border/60 space-y-2 transition-all',
          !closingConfig.enabled && 'opacity-60'
        )}
      >
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-primary" />
            Shop Owner WhatsApp Number
          </label>
          {closingConfig.ownerPhone && (
            <span
              className={clsx(
                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                isValidPhoneNumber(closingConfig.ownerPhone)
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 text-rose-500'
              )}
            >
              {isValidPhoneNumber(closingConfig.ownerPhone) ? '✓ Valid Number' : '⚠️ Invalid Format'}
            </span>
          )}
        </div>
        <input
          type="tel"
          disabled={!isAdmin || !closingConfig.enabled}
          value={closingConfig.ownerPhone}
          onChange={(e) => handlePhoneChange(e.target.value)}
          placeholder="e.g. +91 9876543210 or +971 50 1234567"
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none font-mono"
        />
        <p className="text-[10px] text-muted-foreground leading-normal">
          Enter the owner&apos;s mobile number with country code (e.g. <code>+91</code> for India, <code>+971</code> for UAE).
        </p>
      </div>
    </div>
  );
}
