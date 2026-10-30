import { localizeTaxText } from '../../../utils/localization/storeProfile';
import { Printer, FileText, Pencil, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import type { Quotation } from '../quotationTypes';
import type { QuotationState } from '../hooks/useQuotationState';
import { QuotationDocumentView } from './QuotationDocumentView';

export interface QuotationDetailViewProps {
  handleConvertToInvoice: (q: Quotation) => void;
  handleEditQuotation: (q: Quotation) => void;
  handleExportPdf: () => Promise<void>;
  handlePrint: () => Promise<void>;
  hasConfiguredBank: boolean;
  isInterState: boolean;
  previewAmountInWords: string;
  previewGrandTotal: number;
  previewHasDiscounts: boolean;
  previewHasHsn: boolean;
  qm: QuotationState;
  selectedQuotation: Quotation;
  shopName: string | null;
}

/** Quotation detail: format toolbar with print / export / edit / convert actions, and the quotation document. */
export function QuotationDetailView({
  handleConvertToInvoice, handleEditQuotation, handleExportPdf, handlePrint, hasConfiguredBank, isInterState,
  previewAmountInWords, previewGrandTotal, previewHasDiscounts, previewHasHsn, qm, selectedQuotation, shopName,
}: QuotationDetailViewProps) {
  const { previewGstEnabled, setPreviewGstEnabled } = qm;
  return (
    <div className="w-full px-4 sm:px-6 pt-4 sm:pt-6 pb-10 space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 bg-card border border-border rounded-xl sm:rounded-2xl p-2.5 sm:p-3 lg:p-3.5 shadow-xs">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-[11px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider">Format:</span>
          <button
            type="button"
            onClick={() => setPreviewGstEnabled(!previewGstEnabled)}
            className={clsx(
              'px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5',
              previewGstEnabled
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300'
                : 'bg-slate-500/15 border-slate-500/40 text-slate-700 dark:text-slate-300'
            )}
          >
            <span className={clsx('w-2 h-2 rounded-full', previewGstEnabled ? 'bg-purple-500' : 'bg-slate-400')} />
            {localizeTaxText(previewGstEnabled ? 'GST Enabled (Tax Breakdown)' : 'Non-GST (Compact)')}
          </button>
          <span className="text-[10px] sm:text-[11px] text-muted-foreground hidden sm:inline">
            (Toggle adjusts columns &amp; tax summary dynamically)
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <button
            onClick={handlePrint}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
          >
            <Printer className="w-3.5 h-3.5" /> Print Quotation
          </button>
          <button
            onClick={handleExportPdf}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
          >
            <FileText className="w-3.5 h-3.5" /> Export PDF
          </button>
          {selectedQuotation.status === 'ACTIVE' && (
            <>
              <button
                onClick={() => handleEditQuotation(selectedQuotation)}
                className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => handleConvertToInvoice(selectedQuotation)}
                className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Convert to Invoice
              </button>
            </>
          )}
        </div>
      </div>

      {/* Document Box matching Reference Styling */}
      <QuotationDocumentView
        hasConfiguredBank={hasConfiguredBank}
        isInterState={isInterState}
        previewAmountInWords={previewAmountInWords}
        previewGrandTotal={previewGrandTotal}
        previewHasDiscounts={previewHasDiscounts}
        previewHasHsn={previewHasHsn}
        qm={qm}
        selectedQuotation={selectedQuotation}
        shopName={shopName}
      />
    </div>
  );
}
