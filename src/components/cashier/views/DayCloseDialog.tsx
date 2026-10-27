import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { RedCrossButton } from '../../ui/RedCrossButton';
import { formatCurrency } from '../../../utils/pricing/money';
import type { CashDrawerRow, DayCloseResult } from '../cashierTypes';

export interface DayCloseDialogProps {
  actualCash: number;
  closeRemarks: string;
  closeRemarksRef: React.RefObject<HTMLTextAreaElement | null>;
  closeResult: DayCloseResult | null;
  closeSubmitting: boolean;
  closingDate: string | null;
  drawer: CashDrawerRow | null;
  handleDayClose: () => Promise<void>;
  setActualCash: React.Dispatch<React.SetStateAction<number>>;
  setCloseRemarks: React.Dispatch<React.SetStateAction<string>>;
  setCloseResult: React.Dispatch<React.SetStateAction<DayCloseResult | null>>;
  setClosingDate: React.Dispatch<React.SetStateAction<string | null>>;
  setShowDayClose: React.Dispatch<React.SetStateAction<boolean>>;
  setYesterdayDrawer: React.Dispatch<React.SetStateAction<CashDrawerRow | null>>;
  setYesterdayNotClosed: React.Dispatch<React.SetStateAction<boolean>>;
  yesterdayDrawer: CashDrawerRow | null;
}

/** Day closing dialog: counted cash, expected totals, difference and close. */
export function DayCloseDialog({
  actualCash, closeRemarks, closeRemarksRef, closeResult, closeSubmitting, closingDate, drawer, handleDayClose,
  setActualCash, setCloseRemarks, setCloseResult, setClosingDate, setShowDayClose, setYesterdayDrawer,
  setYesterdayNotClosed, yesterdayDrawer,
}: DayCloseDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={() => { if (!closeSubmitting) { setShowDayClose(false); setClosingDate(null); } }}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-[480px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="relative px-6 py-4 border-b border-border"
          style={{ background: 'linear-gradient(135deg, hsl(0,72%,51%,0.08) 0%, transparent 100%)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-destructive/10">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-foreground">End of Day Closing</h2>
                {closingDate && (
                  <p className="text-[10px] font-bold text-muted-foreground/70 mt-0.5">
                    Closing session for {closingDate}
                  </p>
                )}
              </div>
            </div>
            <RedCrossButton
              onClick={() => { if (!closeSubmitting) { setShowDayClose(false); setClosingDate(null); } }}
              title="Close"
            />
          </div>
        </div>

        <div className="p-6 space-y-4">
          {closeResult ? (
            <>
              <div className="flex flex-col items-center py-8 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                </div>
                <p className="text-xl font-black text-foreground">Day Closed</p>
                <p className="text-xs text-muted-foreground font-semibold mt-1">{closingDate || drawer?.business_date}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-muted/30 rounded-xl text-center border border-border">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">Expected</p>
                  <p className="text-lg font-black text-foreground">{formatCurrency(closeResult.expected_closing)}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-xl text-center border border-border">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">Actual</p>
                  <p className="text-lg font-black text-foreground">{formatCurrency(closeResult.actual_cash)}</p>
                </div>
                {(closeResult.cash_short as number) > 0 && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center col-span-2">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Cash Short</p>
                    <p className="text-xl font-black text-rose-500 mt-0.5">−{formatCurrency(closeResult.cash_short)}</p>
                  </div>
                )}
                {(closeResult.cash_excess as number) > 0 && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center col-span-2">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Cash Excess</p>
                    <p className="text-xl font-black text-emerald-500 mt-0.5">+{formatCurrency(closeResult.cash_excess)}</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => { setShowDayClose(false); setCloseResult(null); setClosingDate(null); setYesterdayNotClosed(false); setYesterdayDrawer(null); }}
                className="w-full py-3 text-sm font-black text-primary-foreground bg-primary rounded-xl hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-muted/20 rounded-xl text-center border border-border">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">Expected Cash</p>
                  <p className="text-lg font-black text-foreground">{formatCurrency(closingDate ? yesterdayDrawer?.expected_closing : drawer?.expected_closing || 0)}</p>
                </div>
                <div className="p-4 bg-primary/5 rounded-xl text-center border-2 border-primary/20">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-1">Current Balance</p>
                  <p className="text-lg font-black text-primary">{formatCurrency(closingDate ? yesterdayDrawer?.current_cash : drawer?.current_cash || 0)}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Actual Cash Count
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                  <input
                    type="number"
                    value={actualCash || ''}
                    onChange={(e) => setActualCash(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-3 text-lg font-black bg-card border-2 border-primary/25 rounded-2xl outline-none focus:border-primary text-foreground tabular-nums shadow-sm transition-all"
                    step="0.01" min="0" placeholder="Enter physical cash count" autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); closeRemarksRef.current?.focus(); } }}
                  />
                </div>
              </div>
              <textarea
                ref={closeRemarksRef}
                value={closeRemarks}
                onChange={(e) => setCloseRemarks(e.target.value)}
                placeholder="Closing remarks (optional)"
                className="w-full px-4 py-2.5 text-sm bg-card border border-border rounded-xl outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/50 resize-none h-20 shadow-sm transition-all"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDayClose(); } }}
              />
              <div className="flex justify-end">
                <button
                  onClick={handleDayClose}
                  disabled={closeSubmitting || actualCash < 0}
                  className="px-6 py-3 text-sm font-black text-white bg-destructive rounded-xl hover:bg-destructive/90 shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-40"
                >
                  {closeSubmitting ? 'Processing…' : 'Complete Day Closing'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
