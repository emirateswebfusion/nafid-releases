import React from 'react';
import { Wallet, Calculator } from 'lucide-react';
import { CashRegisterSettings } from './CashRegisterSettings';
import { CashDrawerAutoCloseSettings } from './CashDrawerAutoCloseSettings';
import { SettingsCard, ToggleRow } from '../views/SettingsControls';
import type { SettingsForm } from '../settingsFormTypes';

export interface CashDrawerSettingsTabProps {
  autoOpenCashDrawer: boolean; setAutoOpenCashDrawer: (v: boolean) => void;
  autoCloseCashDrawer: boolean; setAutoCloseCashDrawer: (v: boolean) => void;
  autoCloseCashDrawerTime: string; setAutoCloseCashDrawerTime: (v: string) => void;
  defaultOpeningBalance: SettingsForm['defaultOpeningBalance']; setDefaultOpeningBalance: SettingsForm['setDefaultOpeningBalance'];
  openCashDrawerOnPending: boolean; setOpenCashDrawerOnPending: (v: boolean) => void;
}

/** Cash Drawer & Register: when the drawer opens / closes, the opening amount, and cash register totals. */
export const CashDrawerSettingsTab: React.FC<CashDrawerSettingsTabProps> = ({
  autoOpenCashDrawer, setAutoOpenCashDrawer,
  autoCloseCashDrawer, setAutoCloseCashDrawer,
  autoCloseCashDrawerTime, setAutoCloseCashDrawerTime,
  defaultOpeningBalance, setDefaultOpeningBalance,
  openCashDrawerOnPending, setOpenCashDrawerOnPending,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <SettingsCard icon={Wallet} title="Cash Drawer" subtitle="When the drawer session opens and closes">
        <div className="space-y-3.5">
          <ToggleRow
            label="Open Cash Drawer on Pending Payment"
            description="When billing with the Pending payment method, automatically open the cash drawer after printing."
            checked={openCashDrawerOnPending}
            onToggle={() => setOpenCashDrawerOnPending(!openCashDrawerOnPending)}
          />
          <ToggleRow
            label="Auto Open Cash Drawer"
            description="Automatically open the cash register drawer session with a default balance on session start."
            checked={autoOpenCashDrawer}
            onToggle={() => setAutoOpenCashDrawer(!autoOpenCashDrawer)}
          />
          {autoOpenCashDrawer && (
            <div className="p-4.5 bg-muted/30 border border-border rounded-2xl hover:border-primary/20 transition-all duration-300">
              <label className="text-xs font-bold text-foreground mb-1 block">Default Opening Amount (₹)</label>
              <p className="text-[10px] text-muted-foreground/75 mb-2.5">Set a default cash amount to start the drawer with. If empty or cleared, opening balance will be 0 (starts from 0).</p>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={defaultOpeningBalance}
                  onChange={(e) => setDefaultOpeningBalance(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 bg-background border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
          )}
          <CashDrawerAutoCloseSettings
            autoCloseEnabled={autoCloseCashDrawer}
            setAutoCloseEnabled={setAutoCloseCashDrawer}
            autoCloseTime={autoCloseCashDrawerTime}
            setAutoCloseTime={setAutoCloseCashDrawerTime}
          />
        </div>
      </SettingsCard>

      <SettingsCard icon={Calculator} title="Cash Register Totals" subtitle="Cash drawer inclusion rules and ledger modes">
        <CashRegisterSettings />
      </SettingsCard>
    </div>
  );
};
