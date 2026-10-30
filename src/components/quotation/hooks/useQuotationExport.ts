import { buildQuotationPrintData } from '../quotationPrintData';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { printingApi } from '../../../data/printing';
import { generateQuotationHtml } from '../../../utils/print/quotationHtmlGenerator';
import type { QuotationState } from './useQuotationState';

export interface UseQuotationExportContext {
  qm: QuotationState;
  shopName: string | null;
  tenantId: string | null;
  userName: string | null;
}

/** Builds the quotation document data and prints / exports the A4 quotation HTML. */
export function useQuotationExport(ctx: UseQuotationExportContext) {
  const { shopName, tenantId, userName } = ctx;
  const { selectedQuotation, setStatusMessage } = ctx.qm;
  const handlePrint = async () => {
    const printData = buildQuotationPrintData(ctx.qm, shopName, userName);
    if (!printData) return;

    const fullHtml = generateQuotationHtml(printData);

    if (isDesktopRuntime()) {
      const printResult = await printingApi.printA4Html(tenantId || 'global', fullHtml);
      if (!printResult.success) {
        const pw = window.open('', '_blank');
        if (pw) { pw.document.write(fullHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
      }
    } else {
      const pw = window.open('', '_blank');
      if (pw) { pw.document.write(fullHtml); pw.document.close(); setTimeout(() => pw.print(), 500); }
    }
  };

  const handleExportPdf = async () => {
    if (!selectedQuotation) return;
    const printData = buildQuotationPrintData(ctx.qm, shopName, userName);
    if (!printData) return;

    const defaultFilename = `Quotation_${selectedQuotation.quotation_number || 'Detail'}.pdf`;
    const fullHtml = generateQuotationHtml(printData);

    if (hasBridge('exportA4Pdf')) {
      const res = await printingApi.exportA4Pdf(tenantId || 'global', fullHtml, defaultFilename);
      if (!res.success && res.error) {
        setStatusMessage({ text: `Export PDF failed: ${res.error}`, type: 'error' });
      }
    } else {
      const pw = window.open('', '_blank');
      if (pw) {
        pw.document.write(fullHtml);
        pw.document.title = defaultFilename.replace('.pdf', '');
        pw.document.close();
        setTimeout(() => pw.print(), 500);
      }
    }
  };

  return { handlePrint, handleExportPdf };
}
