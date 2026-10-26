import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { purchasesApi } from '../../../data/purchases';
import { type PurchaseBillItem } from '../purchaseTypes';
import type { PurchaseBill } from '../purchaseTypes';

export interface UsePurchaseCsvExportContext {
  filteredBills: PurchaseBill[];
  filterType: "ALL" | "GST" | "ESTIMATE" | "PAPER";
  searchQuery: string;
  setIsExporting: React.Dispatch<React.SetStateAction<boolean>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<{ text: string; type: "success" | "error"; } | null>>;
}

/** CSV export of the filtered purchase bills with their items (`handleExportCSV`). */
export function usePurchaseCsvExport(ctx: UsePurchaseCsvExportContext) {
  const { filteredBills, filterType, searchQuery, setIsExporting, setStatusMessage } = ctx;
  const handleExportCSV = async () => {
    if (filteredBills.length === 0) return;
    setIsExporting(true);
    try {
      const billGstMap: Record<string, { sgst: number; cgst: number }> = {};
      const gstBills = filteredBills.filter(b => b.bill_type === 'GST');
      if (gstBills.length > 0 && isDesktopRuntime()) {
        const results = await Promise.all(
          gstBills.map(b => purchasesApi.getPurchaseBillItems(b.purchase_bill_id))
        );
        gstBills.forEach((bill, idx) => {
          const items: PurchaseBillItem[] = Array.isArray(results[idx]) ? results[idx] as PurchaseBillItem[] : [];
          const totalGst = items.reduce((acc, item) => {
            const rate = item.tax_rate_percent || 0;
            if (item.is_gst_applicable === 1 && rate > 0) {
              return acc + Number(item.total_amount) * (rate / 100);
            }
            return acc;
          }, 0);
          billGstMap[bill.purchase_bill_id] = { sgst: totalGst / 2, cgst: totalGst / 2 };
        });
      }
      const headers = [
        'Bill No', 'Date', 'Supplier Name', 'GSTIN',
        'Bill Amount', 'Taxable Amount', 'CGST Amount', 'SGST Amount',
        'IGST Amount', 'CESS Amount', 'Other Amount'
      ];
      const escape = (val: unknown) => {
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };
      const rows = filteredBills.map(b => {
        const { sgst = 0, cgst = 0 } = billGstMap[b.purchase_bill_id] || {};
        const totalGst = cgst + sgst;
        const taxableAmount = b.total_amount - totalGst;
        return [
          escape(b.bill_number),
          escape(new Date(b.bill_date).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\//g, '-')),
          escape(b.supplier_name),
          escape((b as typeof b & { supplier_gstin?: string }).supplier_gstin || ''),
          escape(b.total_amount.toFixed(2)),
          escape(taxableAmount.toFixed(2)),
          escape(cgst.toFixed(2)),
          escape(sgst.toFixed(2)),
          '0.00', '0.00', '0.00',
        ];
      });

      const typeLabel = filterType === 'ALL' ? 'All' : filterType;
      const searchLabel = searchQuery ? `_search-${searchQuery}` : '';
      const dateStr = new Date().toLocaleDateString('en-CA');
      const filename = `purchase-bills_${typeLabel}${searchLabel}_${dateStr}.csv`;

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatusMessage({ text: `Exported ${filteredBills.length} bills to CSV`, type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  return { handleExportCSV };
}
