import { FloatToast } from '../ui/FloatToast';
import { localizeTaxText } from '../../utils/localization/storeProfile';
import { useMemo, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { X, FileText } from 'lucide-react';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { numberToIndianWords } from '../../utils/print/receiptGenerator';
import { useQuotationState } from './hooks/useQuotationState';
import { useQuotationLoader } from './hooks/useQuotationLoader';
import { useQuotationActions } from './hooks/useQuotationActions';
import { useQuotationExport } from './hooks/useQuotationExport';
import { QuotationListView } from './views/QuotationListView';
import { QuotationDetailView } from './views/QuotationDetailView';
import { QuotationConfirmDialog } from './views/QuotationConfirmDialog';
import { syncApi } from '../../data/sync';

export function QuotationManager({ onClose, isRestricted }: { onClose: () => void; isRestricted?: boolean }) {
  useCloseOnEscape(onClose);
  const { shopName, tenantId, userName } = useAuthStore();
  const qm = useQuotationState();
  const {
    bankAccount, bankIfsc, bankName, previewGstEnabled, quotationItems, quotations, search, selectedQuotation,
    setShowDetail, shopState, showDetail, statusMessage, setStatusMessage, statusFilter, upiId,
  } = qm;

  const { loadQuotations } = useQuotationLoader({ qm, tenantId });
  const [isResyncing, setIsResyncing] = useState(false);

  const handleResyncQuotations = async () => {
    if (isResyncing) return;
    setIsResyncing(true);
    try {
      const res = await syncApi.forceResyncEntities(['invoices']);
      if (res?.success) {
        setStatusMessage({ text: 'Quotations synced from cloud', type: 'success' });
        await loadQuotations();
      } else {
        setStatusMessage({ text: res?.error || 'Re-sync failed', type: 'error' });
      }
    } catch {
      setStatusMessage({ text: 'Re-sync failed', type: 'error' });
    } finally {
      setIsResyncing(false);
    }
  };

  const {
    handleCreateNewQuotation, viewQuotation, handleEditQuotation, handleDeleteQuotation, handleConvertToInvoice,
  } = useQuotationActions({ loadQuotations, onClose, qm });

  const { handlePrint, handleExportPdf } = useQuotationExport({ qm, shopName, tenantId, userName });

  const filteredQuotations = useMemo(() => {
    return quotations.filter(q => {
      const matchesSearch = !search ||
        q.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        q.quotation_number?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && q.status !== 'CONVERTED') ||
        (statusFilter === 'CONVERTED' && q.status === 'CONVERTED');
      return matchesSearch && matchesStatus;
    });
  }, [quotations, search, statusFilter]);

  // Derived state for on-screen quotation preview
  const previewHasDiscounts = useMemo(() => {
    return quotationItems.some(i => (i.discount_amount && i.discount_amount > 0) || (i.discount_percent && i.discount_percent > 0));
  }, [quotationItems]);

  const previewHasHsn = useMemo(() => {
    return previewGstEnabled || quotationItems.some(i => Boolean(i.hsn_code && i.hsn_code.trim()));
  }, [previewGstEnabled, quotationItems]);

  const isInterState = useMemo(() => {
    if (!previewGstEnabled || !selectedQuotation) return false;
    const cState = (selectedQuotation.customer_state || '').trim().toLowerCase();
    const sState = (shopState || '').trim().toLowerCase();
    return Boolean(cState && sState && cState !== sState);
  }, [previewGstEnabled, selectedQuotation, shopState]);

  const previewGrandTotal = useMemo(() => {
    if (!selectedQuotation) return 0;
    if (previewGstEnabled) {
      if (Number(selectedQuotation.grand_total) > Number(selectedQuotation.subtotal)) {
        return Number(selectedQuotation.grand_total);
      }
      const totalTaxFromItems = quotationItems.reduce((acc, i) => {
        const lineTotal = Number(i.amount) || ((Number(i.rate) || 0) * (Number(i.quantity) || 0));
        const rate = Number(i.tax_rate_percent) || 0;
        return acc + (lineTotal * (rate / 100));
      }, 0);
      return (Number(selectedQuotation.subtotal) || 0) + totalTaxFromItems;
    }
    return Number(selectedQuotation.subtotal) || 0;
  }, [previewGstEnabled, selectedQuotation, quotationItems]);

  const previewAmountInWords = useMemo(() => {
    return numberToIndianWords(Math.round(previewGrandTotal * 100) / 100);
  }, [previewGrandTotal]);

  const hasConfiguredBank = Boolean(bankName || bankAccount || bankIfsc || upiId);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background font-sans">
      {/* Header */}
      <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
          <div className="p-1.5 sm:p-2 rounded-xl bg-primary/10 text-primary shadow-inner shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-foreground truncate">
                {showDetail ? `Quotation ${selectedQuotation?.quotation_number}` : 'Quotations & Estimates'}
              </h1>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </div>
            {!showDetail && (
              <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium leading-none mt-0.5">{quotations.length} quotations on record</p>
            )}
            {showDetail && (
              <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
                {localizeTaxText(previewGstEnabled ? 'GST-Enabled Quotation' : 'Standard Non-GST Quotation')} • {quotationItems.length} items
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={showDetail ? () => setShowDetail(false) : (isRestricted ? () => useAuthStore.getState().logout() : onClose)}
              className="p-1.5 sm:p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-muted/20">
        {/* LIST VIEW */}
        {!showDetail && (
          <QuotationListView
            filteredQuotations={filteredQuotations}
            handleCreateNewQuotation={handleCreateNewQuotation}
            handleDeleteQuotation={handleDeleteQuotation}
            handleEditQuotation={handleEditQuotation}
            qm={qm}
            viewQuotation={viewQuotation}
            isResyncing={isResyncing}
            onResyncQuotations={handleResyncQuotations}
          />
        )}

        {/* QUOTATION DETAIL (REFERENCE-MATCHED REDESIGN) */}
        {showDetail && selectedQuotation && (
          <QuotationDetailView
            handleConvertToInvoice={handleConvertToInvoice}
            handleEditQuotation={handleEditQuotation}
            handleExportPdf={handleExportPdf}
            handlePrint={handlePrint}
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
        )}
      </div>

      {/* Confirmation Modal */}
      <QuotationConfirmDialog qm={qm} />

      {/* Toast Notification */}
      {statusMessage && (
        <FloatToast message={statusMessage} onClose={() => setStatusMessage(null)} title={statusMessage?.type === 'success' ? 'QUOTATION STATUS' : 'QUOTATION ALERT'} duration={0} />
      )}
    </div>
  );
}
