import type React from 'react';
import { isDesktopRuntime } from '../../../data/client';
import { useAuthStore } from '../../../store/authStore';
import { listInvoices, getInvoiceItems } from '../../../data/invoices';
import { sortInvoicesByInvoiceNumber, buildInvoiceProductRows } from '../../../utils/salesHistoryTax';
import { formatDate, PAYMENT_LABELS } from '../salesHistoryFormat';
import { getProductsByIds } from '../../../data/products';
import { getInvoiceNetTotal } from '../../../utils/salesHistoryAmount';
import { isLegacyBillerRole } from '../../../utils/permissions';
import type { SalesInvoiceRow } from '../salesTypes';

export interface UseSalesCsvExportContext {
  accountingView: "REAL_SALES" | "TAX_FILING" | "ALL";
  filterDate: string;
  filterDateEnd: string;
  invoiceTypeFilter: string;
  paymentFilter: string;
  search: string;
  setExportStatusMsg: React.Dispatch<React.SetStateAction<string | null>>;
  setIsExporting: React.Dispatch<React.SetStateAction<boolean>>;
  taxFilterActive: boolean;
  taxPercentageFilter: string;
}

/**
 * CSV export of the filtered sales list (`handleExportCSV`): loads the invoices for the current filters and
 * accounting view, adds product rows, and downloads a UTF-8 CSV.
 */
export function useSalesCsvExport(ctx: UseSalesCsvExportContext) {
  const { accountingView, filterDate, filterDateEnd, invoiceTypeFilter, paymentFilter, search, setExportStatusMsg, setIsExporting, taxFilterActive, taxPercentageFilter } = ctx;
  const handleExportCSV = async () => {
    if (!isDesktopRuntime()) return;
    setIsExporting(true);
    setExportStatusMsg('Fetching all matching records…');
    try {
      const { userId, role, tenantId, restrictedPage } = useAuthStore.getState();
      const isBiller = isLegacyBillerRole(role);
      const permissions = restrictedPage ? restrictedPage.split(',').filter(Boolean) : [];
      const hasGstInvoicesOnly = isBiller && permissions.includes('OPT_VIEW_GST_INVOICES_ONLY');
      const effectiveInvoiceType = hasGstInvoicesOnly
        ? (invoiceTypeFilter && invoiceTypeFilter !== 'BILL_OF_SUPPLY' ? invoiceTypeFilter : 'GST')
        : accountingView === 'REAL_SALES'
          ? 'BILL_OF_SUPPLY'
          : (invoiceTypeFilter || undefined);

      const data = await listInvoices({
        user_id: userId as string | undefined, tenant_id: tenantId as string | undefined, role: role as string | undefined,
        limit: 99999, offset: 0,
        search: search || undefined,
        payment_method: paymentFilter || undefined,
        invoice_type: effectiveInvoiceType,
        tax_rate_percent: accountingView === 'REAL_SALES' ? undefined : (taxPercentageFilter || undefined),
        filterDate: filterDate || undefined,
        filterDateEnd: filterDateEnd || undefined,
        accounting_view: accountingView,
      });

      if (!Array.isArray(data) || data.length === 0) {
        setExportStatusMsg('No records to export');
        setTimeout(() => setExportStatusMsg(null), 2500);
        return;
      }

      const escape = (val: unknown) => {
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };

      const getTypeLabel = (inv: SalesInvoiceRow) => {
        if (inv.invoice_type === 'GST' && inv.customer_gstin) return 'GST B2B';
        if (inv.invoice_type === 'GST') return 'GST B2C';
        return 'Bill of Supply';
      };

      let exportedCount = 0;

      const parts: string[] = ['sales_report'];
      parts.push(accountingView.toLowerCase().replace('_', '-'));
      if (invoiceTypeFilter) parts.push(invoiceTypeFilter.replace('_', '-').toLowerCase());
      if (paymentFilter) parts.push(paymentFilter.toLowerCase());
      if (taxPercentageFilter) parts.push(`${taxPercentageFilter}pct`);
      if (filterDate) parts.push(filterDate);
      if (filterDateEnd && filterDateEnd !== filterDate) parts.push(`to-${filterDateEnd}`);
      parts.push(new Date().toLocaleDateString('en-CA'));
      const filename = parts.join('_') + '.csv';

      const headers = [
        'Invoice No.',
        'Invoice Date',
        'Invoice Time',
        'Invoice Type',
        'Customer Name',
        'Customer Phone',
        'Customer GSTIN',
        'Place of Supply / State',
        'Payment Method',
        'Product / Item Name',
        'HSN / SAC Code',
        'Quantity',
        'UOM',
        'Unit Price (₹)',
        'Discount (₹)',
        'Taxable Amount (₹)',
        'Total GST %',
        'Total GST (₹)',
        'CGST %',
        'CGST (₹)',
        'SGST %',
        'SGST (₹)',
        'IGST %',
        'IGST (₹)',
        'Item Total (₹)',
        taxFilterActive ? 'Filtered Product Total (₹)' : 'Invoice Grand Total (₹)',
        'Biller Name',
        'Description / Remarks'
      ];

      const itemRows: string[][] = [];
      let totalQtySum = 0;
      let totalTaxableSum = 0;
      let totalGstSum = 0;
      let totalCgstSum = 0;
      let totalSgstSum = 0;
      let totalIgstSum = 0;
      let totalItemSum = 0;
      let totalInvoiceGrandSum = 0;

      const targetTaxRate = taxFilterActive ? Number(taxPercentageFilter) : null;
      const exportData = taxFilterActive && accountingView === 'ALL'
        ? data.filter((inv) => !inv.converted_from_invoice_id)
        : data;
      const sortedData = sortInvoicesByInvoiceNumber(exportData);

      for (const inv of sortedData) {
        const { date, time } = formatDate(inv.created_at || '');
        const typeLabel = getTypeLabel(inv);

        let items = await getInvoiceItems(inv.invoice_id);
        if (!Array.isArray(items)) items = [];

        const missingHsnProductIds = items.filter((it) => !it.hsn_sac_code && it.product_id).map((it) => it.product_id);
        const fallbackProductMap: Record<string, any> = {};
        if (missingHsnProductIds.length > 0) {
          try {
            const fetched = await getProductsByIds({ tenant_id: tenantId || 'global', product_ids: missingHsnProductIds });
            if (Array.isArray(fetched)) {
              fetched.forEach((p) => { if (p?.product_id) fallbackProductMap[p.product_id] = p; });
            }
          } catch { /* ignore */ }
        }

        const productRows = buildInvoiceProductRows(inv, items);
        const rowsToExport = targetTaxRate !== null
          ? productRows.filter(row => Math.round(row.gstRate) === Math.round(targetTaxRate))
          : productRows;

        if (rowsToExport.length === 0) continue;

        if (targetTaxRate === null) {
          totalInvoiceGrandSum += getInvoiceNetTotal(inv);
        }

        for (const row of rowsToExport) {
          const item = row.item || {};
          const hsn = row.hsn || fallbackProductMap[item.product_id]?.hsn_sac_code || '';
          const uom = item.uom || item.unit || fallbackProductMap[item.product_id]?.uom || row.uom || 'PCS';
          const invoiceTotal = targetTaxRate === null ? getInvoiceNetTotal(inv) : row.total;

          totalQtySum += row.quantity;
          totalTaxableSum += row.taxable;
          totalGstSum += row.tax;
          totalCgstSum += row.cgstAmount;
          totalSgstSum += row.sgstAmount;
          totalIgstSum += row.igstAmount;
          totalItemSum += row.total;
          if (targetTaxRate !== null) totalInvoiceGrandSum += row.total;

          itemRows.push([
            escape(inv.invoice_number),
            escape(date),
            escape(time),
            escape(typeLabel),
            escape(inv.customer_name || 'Walk-in'),
            escape(inv.customer_phone || '-'),
            escape(inv.customer_gstin || '-'),
            escape(inv.customer_state || '-'),
            escape(PAYMENT_LABELS[inv.payment_method || 'CASH'] || inv.payment_method || 'CASH'),
            escape(row.name || 'Item'),
            escape(hsn || '-'),
            escape(row.quantity.toFixed(3)),
            escape(uom),
            escape(row.unitPrice.toFixed(2)),
            escape(row.discount.toFixed(2)),
            escape(row.taxable.toFixed(2)),
            escape(row.gstRate > 0 ? `${row.gstRate}%` : '0%'),
            escape(row.tax.toFixed(2)),
            escape(row.cgstRate > 0 ? `${row.cgstRate}%` : '0%'),
            escape(row.cgstAmount.toFixed(2)),
            escape(row.sgstRate > 0 ? `${row.sgstRate}%` : '0%'),
            escape(row.sgstAmount.toFixed(2)),
            escape(row.igstRate > 0 ? `${row.igstRate}%` : '0%'),
            escape(row.igstAmount.toFixed(2)),
            escape(row.total.toFixed(2)),
            escape(invoiceTotal.toFixed(2)),
            escape(inv.biller_name || ''),
            escape(inv.description || inv.notes || ''),
          ]);
        }
      }

      if (itemRows.length > 0) {
        itemRows.push([
          escape('TOTAL'),
          escape(''),
          escape(''),
          escape(''),
          escape(''),
          escape(''),
          escape(''),
          escape(''),
          escape(''),
          escape(`Total Records: ${itemRows.length}`),
          escape(''),
          escape(totalQtySum.toFixed(3)),
          escape(''),
          escape(''),
          escape(''),
          escape(totalTaxableSum.toFixed(2)),
          escape(''),
          escape(totalGstSum.toFixed(2)),
          escape(''),
          escape(totalCgstSum.toFixed(2)),
          escape(''),
          escape(totalSgstSum.toFixed(2)),
          escape(''),
          escape(totalIgstSum.toFixed(2)),
          escape(totalItemSum.toFixed(2)),
          escape(totalInvoiceGrandSum.toFixed(2)),
          escape(''),
          escape(''),
        ]);
      }

      const csvContent = [headers.join(','), ...itemRows.map(r => r.join(','))].join('\n');
      exportedCount = itemRows.length > 0 ? itemRows.length - 1 : 0;

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportStatusMsg(`✓ Exported ${exportedCount} record${exportedCount !== 1 ? 's' : ''}`);
      setTimeout(() => setExportStatusMsg(null), 3000);
    } catch (err) {
      console.error('Export failed', err);
      setExportStatusMsg('Export failed');
      setTimeout(() => setExportStatusMsg(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  return { handleExportCSV };
}
