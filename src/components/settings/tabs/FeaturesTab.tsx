import React from 'react';
import { Power, AlertCircle, TrendingUp, Handshake, Layers, Check, FileText, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { FEATURE_LIST, type FeatureFlags, useFeatureFlagsStore, sanitizeFeatureFlags } from '../../../featureFlags';
import type { SettingsForm } from '../settingsFormTypes';

export interface FeaturesTabProps {
  featureFlags: any;
  handleToggleFeatureFlag: (key: any, nextVal?: boolean) => void;
  enablePartyEstimate: boolean; setEnablePartyEstimate: (v: boolean) => void;
  enablePartyGst: boolean; setEnablePartyGst: (v: boolean) => void;
  loyaltyAwardOnPending: boolean; setLoyaltyAwardOnPending: (v: boolean) => void;
  loyaltyEarningRate: number | string; setLoyaltyEarningRate: SettingsForm['setLoyaltyEarningRate'];
  loyaltyRedemptionRate: number | string; setLoyaltyRedemptionRate: SettingsForm['setLoyaltyRedemptionRate'];
  saving: boolean;
  confirmTurnOffAllModalOpen: boolean; setConfirmTurnOffAllModalOpen: (v: boolean) => void;
  showCashRegister: boolean; setShowCashRegister: (v: boolean) => void;
}

export const FeaturesTab: React.FC<FeaturesTabProps> = ({
  featureFlags,
  handleToggleFeatureFlag,
  enablePartyEstimate, setEnablePartyEstimate,
  enablePartyGst, setEnablePartyGst,
  loyaltyAwardOnPending, setLoyaltyAwardOnPending,
  loyaltyEarningRate, setLoyaltyEarningRate,
  loyaltyRedemptionRate, setLoyaltyRedemptionRate,
  setConfirmTurnOffAllModalOpen,
  setShowCashRegister,
}) => {
  return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-card/45 dark:bg-card/25 border border-border/50 rounded-[28px] p-6 md:p-8 shadow-sm hover:shadow-md hover:border-primary/20 hover:bg-card/65 transition-all duration-300 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/40">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                  <Power className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Features &amp; Modules</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmTurnOffAllModalOpen(true)}
                    className="px-3 py-1.5 text-[10px] font-bold text-destructive bg-destructive/10 hover:bg-destructive/15 border border-destructive/25 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    Turn Off All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      useFeatureFlagsStore.getState().setFlags(sanitizeFeatureFlags(Object.fromEntries(FEATURE_LIST.map(f => [f.key, true])) as FeatureFlags));
                      setShowCashRegister(true);
                    }}
                    className="px-3 py-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
                  >
                    Turn On All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FEATURE_LIST.map(def => {
                  const enabled = featureFlags?.[def.key];
                  return (
                    <div
                      key={def.key}
                      className={clsx(
                        'flex items-center justify-between gap-4 p-4.5 rounded-2xl border transition-all duration-300',
                        enabled ? 'bg-muted/20 dark:bg-muted/10 border-border/60 hover:border-primary/25' : 'bg-background border-border/40 opacity-75 hover:border-destructive/25'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-bold text-foreground cursor-pointer select-none" onClick={() => handleToggleFeatureFlag(def.key)}>{def.label}</label>
                        <p className="text-[10px] text-muted-foreground/75 mt-0.5 leading-relaxed">{def.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleFeatureFlag(def.key)}
                        className={clsx('relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer', enabled ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20')}
                        title={enabled ? 'Enabled' : 'Disabled'}
                      >
                        <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300', enabled ? 'translate-x-5' : 'translate-x-0')} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 bg-blue-500/[0.04] border border-blue-500/20 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                  Disabled features are hidden everywhere — dashboards, billing page buttons, and manager screens. Existing data is never deleted; re-enabling a feature restores it. Changes apply after saving.
                </p>
              </div>

              {/* Points Earning & Redemption Rules (when Loyalty Points is enabled) */}
              {featureFlags?.loyalty && (
                <div className="mt-6 bg-card border border-border rounded-[28px] p-6 md:p-8 shadow-sm animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                    <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 shadow-[0_4px_12px_rgba(245,158,11,0.1)] shrink-0">
                      <TrendingUp className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-foreground uppercase tracking-widest">Points Earning &amp; Redemption Rules</h3>
                      <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Configure how customers earn loyalty points on purchases and their redemption value</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5 p-4 rounded-2xl bg-muted/20 border border-border/60">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1">Earning Rate</label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-muted-foreground font-mono">₹</span>
                        <input
                          type="number"
                          min="1"
                          value={loyaltyEarningRate}
                          onChange={e => setLoyaltyEarningRate(e.target.value === '' ? 100 : Number(e.target.value))}
                          className="w-full bg-background border border-border/80 rounded-xl p-2.5 text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none transition-all text-sm font-bold font-mono"
                        />
                        <span className="text-xs font-bold text-muted-foreground shrink-0">= 1 Pt</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">Customer earns 1 point per ₹{loyaltyEarningRate} spent.</p>
                    </div>
                    <div className="space-y-1.5 p-4 rounded-2xl bg-muted/20 border border-border/60">
                      <label className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-1">Redemption Value</label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground shrink-0">1 Pt = ₹</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={loyaltyRedemptionRate}
                          onChange={e => setLoyaltyRedemptionRate(e.target.value === '' ? 1 : Number(e.target.value))}
                          className="w-full bg-background border border-border/80 rounded-xl p-2.5 text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none transition-all text-sm font-bold font-mono"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">Each point gives ₹{loyaltyRedemptionRate} discount on bills.</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border/60">
                    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-muted/20 border border-border/60 hover:border-primary/20 transition-all duration-300">
                      <div className="flex-1 min-w-0">
                        <label
                          className="text-xs font-bold text-foreground cursor-pointer select-none"
                          onClick={() => setLoyaltyAwardOnPending(!loyaltyAwardOnPending)}
                        >
                          Award Points on Pending Bills
                        </label>
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                          {loyaltyAwardOnPending
                            ? 'ON: Points are awarded immediately when a bill is created, even while payment is pending.'
                            : 'OFF: Points are awarded only after the bill is paid / settled in Cash Settlement.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLoyaltyAwardOnPending(!loyaltyAwardOnPending)}
                        className={clsx(
                          'relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 cursor-pointer',
                          loyaltyAwardOnPending ? 'bg-primary shadow-[0_2px_8px_rgba(79,70,229,0.3)]' : 'bg-muted-foreground/20'
                        )}
                        title={loyaltyAwardOnPending ? 'Award on Pending (ON)' : 'Award only after Paid (OFF)'}
                      >
                        <span
                          className={clsx(
                            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300',
                            loyaltyAwardOnPending ? 'translate-x-5' : 'translate-x-0'
                          )}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Party Ledger Balance Modes Card */}
              <div className="mt-6 bg-card border border-border rounded-[28px] p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
                  <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-[0_4px_12px_rgba(79,70,229,0.1)] shrink-0">
                    <Handshake className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-foreground uppercase tracking-widest">Party Ledger Balance Modes</h3>
                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Control whether party ledgers track separate GST &amp; Estimate balances or a single balance</p>
                  </div>
                </div>

                {(() => {
                  const currentMode: 'BOTH' | 'GST_ONLY' | 'ESTIMATE_ONLY' | 'SINGLE' =
                    enablePartyGst && enablePartyEstimate ? 'BOTH' :
                    enablePartyGst && !enablePartyEstimate ? 'GST_ONLY' :
                    !enablePartyGst && enablePartyEstimate ? 'ESTIMATE_ONLY' : 'SINGLE';

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {/* Option 1: Both (Separate GST & Estimate) */}
                      <div
                        onClick={() => {
                          setEnablePartyGst(true);
                          setEnablePartyEstimate(true);
                        }}
                        className={clsx(
                          'p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between text-left relative group',
                          currentMode === 'BOTH'
                            ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm'
                            : 'border-border/80 bg-muted/20 hover:border-border hover:bg-muted/40'
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary">
                              <Layers className="w-4 h-4" /> Separate Both
                            </span>
                            {currentMode === 'BOTH' && (
                              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black shadow-xs">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-foreground">Separate GST &amp; Estimate Balances</h4>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            Maintains separate GST and Estimate ledgers. In transactions, choose which balance to adjust against. Both are shown with distinct colors.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/40 text-[10px] font-bold">
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">GST Balance: Active</span>
                          <span className="px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20">Estimate: Active</span>
                        </div>
                      </div>

                      {/* Option 2: GST Balance Only */}
                      <div
                        onClick={() => {
                          setEnablePartyGst(true);
                          setEnablePartyEstimate(false);
                        }}
                        className={clsx(
                          'p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between text-left relative group',
                          currentMode === 'GST_ONLY'
                            ? 'border-sky-500 bg-sky-500/5 dark:bg-sky-500/10 shadow-sm'
                            : 'border-border/80 bg-muted/20 hover:border-border hover:bg-muted/40'
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-sky-600 dark:text-sky-400">
                              <FileText className="w-4 h-4" /> GST Only
                            </span>
                            {currentMode === 'GST_ONLY' && (
                              <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-black shadow-xs">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-foreground">GST Balance Only</h4>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            Party ledgers track GST tax balance. Estimate balance is turned off and <strong>never shown anywhere</strong> in the app.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/40 text-[10px] font-bold">
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">GST Balance: Active</span>
                          <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">Estimate: Hidden Everywhere</span>
                        </div>
                      </div>

                      {/* Option 3: Estimate Balance Only */}
                      <div
                        onClick={() => {
                          setEnablePartyGst(false);
                          setEnablePartyEstimate(true);
                        }}
                        className={clsx(
                          'p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between text-left relative group',
                          currentMode === 'ESTIMATE_ONLY'
                            ? 'border-violet-500 bg-violet-500/5 dark:bg-violet-500/10 shadow-sm'
                            : 'border-border/80 bg-muted/20 hover:border-border hover:bg-muted/40'
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-violet-600 dark:text-violet-400">
                              <TrendingUp className="w-4 h-4" /> Estimate Only
                            </span>
                            {currentMode === 'ESTIMATE_ONLY' && (
                              <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-black shadow-xs">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-foreground">Estimate Balance Only</h4>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            Party ledgers track Estimate / Non-GST balance. GST balance is turned off and <strong>never shown anywhere</strong> in the app.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/40 text-[10px] font-bold">
                          <span className="px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20">Estimate Balance: Active</span>
                          <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">GST: Hidden Everywhere</span>
                        </div>
                      </div>

                      {/* Option 4: Single General Balance */}
                      <div
                        onClick={() => {
                          setEnablePartyGst(false);
                          setEnablePartyEstimate(false);
                        }}
                        className={clsx(
                          'p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between text-left relative group',
                          currentMode === 'SINGLE'
                            ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm'
                            : 'border-border/80 bg-muted/20 hover:border-border hover:bg-muted/40'
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground">
                              <Wallet className="w-4 h-4" /> General
                            </span>
                            {currentMode === 'SINGLE' && (
                              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black shadow-xs">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-foreground">Single General Balance</h4>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            Traditional unified ledger. Combines all bills into one balance without GST or Estimate labels anywhere.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/40 text-[10px] font-bold">
                          <span className="px-2 py-0.5 rounded-md bg-muted text-foreground border border-border">Combined Single Balance</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
  );
};
