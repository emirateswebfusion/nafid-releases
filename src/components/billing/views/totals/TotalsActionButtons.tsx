import { Save, FileText, CheckCircle2, ArrowLeftRight, Recycle, CreditCard } from 'lucide-react';
import { WhatsAppIcon } from '../../../ui/WhatsAppIcon';
import type { CartItem } from '../../../../store/cartStore';
import type { BillingTotalsPanelProps } from '../BillingTotalsPanel';

export interface TotalsActionButtonsProps {
  checkoutBtnRef: BillingTotalsPanelProps['checkoutBtnRef'];
  editingActive: string | null;
  editingQuotationId: string | null;
  handleCheckout: BillingTotalsPanelProps['handleCheckout'];
  handleHoldBill: BillingTotalsPanelProps['handleHoldBill'];
  handleProcessReturnFromCart: BillingTotalsPanelProps['handleProcessReturnFromCart'];
  handleSaveQuotation: BillingTotalsPanelProps['handleSaveQuotation'];
  handleWhatsAppSendActiveBill: BillingTotalsPanelProps['handleWhatsAppSendActiveBill'];
  isCheckingOut: boolean;
  isQuotationActive: boolean;
  isReturnMode: boolean;
  isScrapMode: boolean;
  isSendingWhatsApp: boolean;
  items: CartItem[];
  quotationSaving: boolean;
  returnProcessed: boolean;
  returnProcessing: boolean;
}

/** Billing action buttons: save / print / quotation / return actions, scaled for the screen size. */
export function TotalsActionButtons({
  checkoutBtnRef, editingActive, editingQuotationId, handleCheckout, handleHoldBill, handleProcessReturnFromCart,
  handleSaveQuotation, handleWhatsAppSendActiveBill, isCheckingOut, isQuotationActive, isReturnMode, isScrapMode,
  isSendingWhatsApp, items, quotationSaving, returnProcessed, returnProcessing,
}: TotalsActionButtonsProps) {
  return (
    <div className="flex gap-1.5 sm:gap-2 md:gap-2.5 px-2.5 py-2 sm:px-3.5 sm:py-2.5 md:px-4 md:py-3 transition-all">
      {isQuotationActive ? (
        /* ── Quotation Mode (Create or Edit) ── */
        <>
          <button
            onClick={() => handleSaveQuotation(false)}
            disabled={quotationSaving || items.length === 0}
            className="w-[20%] sm:w-[22%] md:w-[25%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-blue-400/60 text-blue-600 dark:text-blue-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-blue-500/10 hover:border-blue-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
          >
            <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Save</span>
          </button>
          <button
            onClick={handleWhatsAppSendActiveBill}
            disabled={isSendingWhatsApp || items.length === 0}
            className="px-2.5 sm:px-3 md:px-3.5 py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-emerald-500/10 hover:border-emerald-500 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
            title="Send Active Bill via WhatsApp"
          >
            {isSendingWhatsApp ? (
              <div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin shrink-0" />
            ) : (
              <WhatsAppIcon className="w-4 h-4 fill-emerald-500 text-emerald-500 shrink-0" />
            )}
            <span className="hidden sm:inline">WhatsApp</span>
          </button>
          <button
            onClick={() => handleSaveQuotation(true)}
            disabled={quotationSaving || items.length === 0}
            className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-blue-500 text-white font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-blue-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
          >
            {quotationSaving ? (
              <>
                <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                <span className="truncate">SAVING...</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                <span className="truncate">{editingQuotationId ? 'UPDATE & PRINT (F12)' : 'SAVE & PRINT (F12)'}</span>
              </>
            )}
          </button>
        </>
      ) : isReturnMode ? (
        /* ── Return Mode ── */
        <>
          <button
            onClick={() => handleProcessReturnFromCart(true)}
            disabled={returnProcessing || items.length === 0}
            className="w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-rose-400/60 text-rose-600 dark:text-rose-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-rose-500/10 hover:border-rose-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
          >
            <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Save</span>
          </button>
          <button
            onClick={() => handleProcessReturnFromCart()}
            disabled={returnProcessing || items.length === 0}
            className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-rose-500 text-white font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-rose-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
          >
            {returnProcessed ? (
              <><CheckCircle2 className="w-4 h-4 shrink-0" /><span className="truncate">RETURN PROCESSED!</span></>
            ) : returnProcessing ? (
              <>
                <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                <span className="truncate">PROCESSING...</span>
              </>
            ) : (
              <>
                <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                <span className="truncate">PROCESS &amp; PRINT (F12)</span>
              </>
            )}
          </button>
        </>
      ) : isScrapMode ? (
        /* ── Scrap Mode ── */
        <>
          <button
            onClick={() => handleCheckout(true)}
            disabled={isCheckingOut || items.length === 0}
            className="w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-orange-400/60 text-orange-600 dark:text-orange-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-orange-500/10 hover:border-orange-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
          >
            <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Save</span>
          </button>
          <button
            onClick={() => handleCheckout()}
            disabled={isCheckingOut || items.length === 0}
            className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-orange-500 text-white font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-orange-600 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
          >
            {isCheckingOut ? (
              <>
                <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                <span className="truncate">SAVING...</span>
              </>
            ) : (
              <>
                <Recycle className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                <span className="truncate">SAVE &amp; PRINT (F12)</span>
              </>
            )}
          </button>
        </>
      ) : (
        /* ── Normal Billing Mode ── */
        <>
          <button
            onClick={handleHoldBill}
            disabled={items.length === 0}
            className="relative w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-border text-muted-foreground font-black text-xs sm:text-xs md:text-sm lg:text-base hover:bg-muted hover:text-foreground hover:border-muted-foreground/30 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer flex items-center justify-center gap-1 shrink-0"
            title="Hold Bill (F3)"
          >
            <span>Hold</span>
            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-4 sm:h-4.5 px-1 sm:px-1.5 text-[8px] sm:text-[9px] font-black rounded-full leading-none shadow-xs border-2 border-background bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">F3</span>
          </button>
          <button
            onClick={() => handleCheckout(true)}
            disabled={isCheckingOut || items.length === 0}
            className="w-[18%] sm:w-[20%] md:w-[22%] py-2 sm:py-2.5 md:py-3 rounded-xl border-2 border-amber-400/60 text-amber-600 dark:text-amber-400 font-black text-xs sm:text-xs md:text-sm lg:text-base flex items-center justify-center gap-1 sm:gap-1.5 hover:bg-amber-500/10 hover:border-amber-400 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-xs cursor-pointer shrink-0"
          >
            <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Save</span>
          </button>
          <button
            ref={checkoutBtnRef}
            onClick={() => handleCheckout()}
            disabled={isCheckingOut || items.length === 0}
            className="flex-1 min-w-0 py-2 sm:py-2.5 md:py-3 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-primary text-primary-foreground font-black text-xs sm:text-xs md:text-sm lg:text-base shadow-md hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed tracking-wide cursor-pointer"
          >
            {isCheckingOut ? (
              <>
                <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin shrink-0" />
                <span className="truncate">FINALIZING...</span>
              </>
            ) : editingActive ? (
              <>
                <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                <span className="truncate">UPDATE &amp; PRINT (F12)</span>
              </>
            ) : (
              <>
                <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-4.5 lg:h-4.5 shrink-0" />
                <span className="truncate">PRINT (F12)</span>
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
