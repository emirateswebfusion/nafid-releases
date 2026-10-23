import { AlertCircle, CheckCircle2, FileText, RotateCcw, Smartphone } from 'lucide-react';

export interface BillingToastsProps {
  checkoutSuccess: false | "saved" | "printed";
  hardwareError: string | null;
  infoToast: string | null;
  quotationSuccess: string | null;
  returnSuccessToast: string | null;
  upiAccountToast: string | null;
}

/** Floating toasts at the bottom left of billing: hardware error, checkout / quotation / return success, info and UPI account messages. */
export function BillingToasts({ checkoutSuccess, hardwareError, infoToast, quotationSuccess, returnSuccessToast, upiAccountToast }: BillingToastsProps) {
  return (
    <div className="fixed bottom-5 left-5 z-[9999] flex flex-col items-start gap-2.5 w-full max-w-md pointer-events-none">
      {hardwareError && (
        <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
          <div className="p-2 rounded-xl bg-red-500/25 text-red-400 shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">HARDWARE & PRINT ALERT</span>
            <span className="text-white font-bold text-xs block leading-tight">{hardwareError}</span>
          </div>
        </div>
      )}
      {checkoutSuccess && (
        <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
          <div className="p-2 rounded-xl bg-emerald-500/25 text-emerald-400 shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">CHECKOUT COMPLETE</span>
            <span className="text-white font-bold text-xs block leading-tight">{checkoutSuccess === 'printed' ? 'Invoice completed & Receipt printed!' : 'Invoice saved successfully!'}</span>
          </div>
        </div>
      )}
      {quotationSuccess && (
        <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
          <div className="p-2 rounded-xl bg-blue-500/25 text-blue-400 shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">QUOTATION SAVED</span>
            <span className="text-white font-bold text-xs block leading-tight">{quotationSuccess}</span>
          </div>
        </div>
      )}
      {returnSuccessToast && (
        <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
          <div className="p-2 rounded-xl bg-rose-500/25 text-rose-400 shrink-0">
            <RotateCcw className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">RETURN PROCESSED</span>
            <span className="text-white font-bold text-xs block leading-tight">{returnSuccessToast}</span>
          </div>
        </div>
      )}
      {infoToast && (
        <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto w-full">
          <div className="p-2 rounded-xl bg-amber-500/25 text-amber-400 shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">NOTIFICATION</span>
            <span className="text-white font-bold text-xs block leading-tight">{infoToast}</span>
          </div>
        </div>
      )}
      {upiAccountToast && (
        <div className="px-4 py-3 bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto max-w-sm">
          <div className="p-2 rounded-xl bg-violet-500/25 text-violet-400 shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 leading-snug">
            <span className="text-slate-400 block text-[10px] font-black uppercase tracking-wider">UPI Account Selected</span>
            <span className="text-white font-black text-xs truncate block">{upiAccountToast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
