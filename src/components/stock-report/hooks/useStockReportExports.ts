import { isDesktopRuntime } from '../../../data/client';
import { printingApi } from '../../../data/printing';
import { formatCurrency } from '../../../utils/money';
import { calculateMaskedStockValuation } from '../../../utils/staffDataMasking';
import { getStoreTimezone } from '../../../utils/timezoneHelper';
import type { Product, ProductBillQty, StockGradeRow } from '../stockReportTypes';
import type { StockReportState } from './useStockReportState';

export interface UseStockReportExportsContext {
  sr: StockReportState;
  shopName: string | null;
  tenantId: string | null;
  filteredProducts: Product[];
  gradeMap: Map<string, StockGradeRow>;
  billQtyMap: Map<string, ProductBillQty>;
  getMrp: (p: Product) => number;
  canViewCost: boolean;
  isStaff: boolean;
  shouldMask: boolean;
}

/** Stock report exports: the product CSV download and the A4 print report. */
export function useStockReportExports(ctx: UseStockReportExportsContext) {
  const { sr, shopName, tenantId, filteredProducts, gradeMap, billQtyMap, getMrp, canViewCost, isStaff, shouldMask } = ctx;
  const { billQuantities, maskingConfig, viewMode } = sr;

  const handleDownloadCsv = () => {
    const headers = ['Product', 'Category', 'Grade', 'Stock'];
    if (viewMode !== 'estimate') headers.push('GST Qty');
    if (viewMode !== 'gst') headers.push('Est Qty');
    headers.push('Weight', 'Purchase Price', 'MRP', 'Selling Price');

    const rows: string[][] = [headers];
    for (const p of filteredProducts) {
      const gr = p.grade_id ? gradeMap.get(p.grade_id) : null;
      const bq = billQtyMap.get(p.product_id);
      const da = (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })();
      const unitWeightGrams = Number(da?.weight_grams) || 0;
      const totalWeight = p.billing_type === 'WEIGHT' ? Number(p.current_stock) : unitWeightGrams > 0 ? (unitWeightGrams / 1000) * Number(p.current_stock) : 0;
      const totalPcs = p.billing_type === 'WEIGHT' ? (Number(da?.pcs) || 0) : Number(p.current_stock);
      const rate = getMrp(p);
      let finalSellingPrice = rate;
      if (p.offer_price) finalSellingPrice = Number(p.offer_price);
      else if (p.discount_flat) finalSellingPrice = rate - Number(p.discount_flat);
      else if (p.discount_percent) finalSellingPrice = rate * (1 - Number(p.discount_percent) / 100);
      finalSellingPrice = Math.max(finalSellingPrice, 0);
      const weightStr = totalWeight > 0 ? totalWeight.toFixed(2) + ' KG' + (totalPcs > 0 ? ' (' + totalPcs + ' pcs)' : '') : '-';
      const row: string[] = [
        p.name,
        p.category || '-',
        gr?.grade_name || '-',
        Number(p.current_stock).toFixed(0),
      ];
      if (viewMode !== 'estimate') row.push(bq ? Number(bq.gst_qty).toFixed(0) : '0');
      if (viewMode !== 'gst') row.push(bq ? Number(bq.estimate_qty).toFixed(0) : '0');
      row.push(weightStr, canViewCost ? formatCurrency(Number(p.purchase_price) || 0) : '•••', formatCurrency(rate), formatCurrency(finalSellingPrice));
      rows.push(row);
    }
    const csvContent = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StockReport_${shopName || 'Shop'}_${new Date().toLocaleDateString('en-CA')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = async () => {
    const repGroupedByCategory = filteredProducts.reduce<Record<string, typeof filteredProducts>>((acc, p) => {
      const cat = p.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    }, {});

    const totalStockVal = filteredProducts.reduce((sum, p) => sum + Math.max(0, Number(p.current_stock)), 0);
    const totalValueVal = filteredProducts.reduce((sum, p) => {
      const rate = getMrp(p);
      return sum + (rate * Math.max(0, Number(p.current_stock)));
    }, 0);
    const totalProductsVal = filteredProducts.length;
    const outOfStockVal = filteredProducts.filter(p => Number(p.current_stock) <= 0).length;

    const totalGstQty = billQuantities.reduce((s, b) => s + Number(b.gst_qty), 0);
    const totalEstQty = billQuantities.reduce((s, b) => s + Number(b.estimate_qty), 0);

    const printColSpan = viewMode === 'combined' ? 9 : 8;
    const gstTh = '<th class="text-right">GST Qty</th>';
    const estTh = '<th class="text-right">Est Qty</th>';

    const categoryRows = Object.entries(repGroupedByCategory).map(([cat, items]) => {
      const detailRows = items.map(p => {
        const gr = p.grade_id ? gradeMap.get(p.grade_id) : null;
        const grRate = gr ? Number(gr.rate) : null;
        const rate = grRate !== null && p.pricing_mode === 'GRADE_RATE' ? Number(p.base_price) + grRate : Number(p.base_price);
        const value = rate * Math.max(0, Number(p.current_stock));
        const da = (() => { try { return JSON.parse(p.domain_attributes || '{}'); } catch { return {}; } })();
        const unitWeightGrams = Number(da?.weight_grams) || 0;
        const totalWeight = p.billing_type === 'WEIGHT' ? Number(p.current_stock) : unitWeightGrams > 0 ? (unitWeightGrams / 1000) * Number(p.current_stock) : 0;
        const totalPcs = p.billing_type === 'WEIGHT' ? (Number(da?.pcs) || 0) : 0;
        const weightStr = totalWeight > 0 ? totalWeight.toFixed(2) + ' KG' + (totalPcs > 0 ? ' (' + totalPcs + ' pcs)' : '') : '-';
        const bq = billQtyMap.get(p.product_id);
        const gstQty = bq ? Number(bq.gst_qty).toFixed(0) : '0';
        const estQty = bq ? Number(bq.estimate_qty).toFixed(0) : '0';
        let cells = `<td style="padding:6px;border:1px solid #ddd;">${p.name}</td>\n          <td style="padding:6px;border:1px solid #ddd;color:#666;">${p.category || '-'}</td>\n          <td style="padding:6px;border:1px solid #ddd;color:#666;">${gr?.grade_name || '-'}</td>\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${Number(p.current_stock).toFixed(0)}</td>`;
        if (viewMode !== 'estimate') cells += `\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${gstQty}</td>`;
        if (viewMode !== 'gst') cells += `\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${estQty}</td>`;
        cells += `\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${weightStr}</td>\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;">${formatCurrency(rate)}</td>\n          <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">${formatCurrency(value)}</td>`;
        return `<tr>\n          ${cells}\n        </tr>`;
      }).join('');
      return `<tr style="background:#e8f0fe;font-weight:bold;">\n        <td colspan="${printColSpan}" style="padding:8px 6px;border:1px solid #ddd;color:#2563eb;">${cat}</td>\n      </tr>${detailRows}`;
    }).join('');

    const theadCols = '<th>Product</th><th>Category</th><th>Grade</th><th class="text-right">Stock</th>'
      + (viewMode !== 'estimate' ? gstTh : '')
      + (viewMode !== 'gst' ? estTh : '')
      + '<th class="text-right">Weight</th><th class="text-right">Rate</th><th class="text-right">Value</th>';

    const maskedPrintTotalVal = calculateMaskedStockValuation(totalValueVal, maskingConfig, isStaff);
    const displayPrintVal = maskedPrintTotalVal.isHidden ? '••••••••' : formatCurrency(maskedPrintTotalVal.displayAmount);
    const displayPrintStock = (shouldMask && maskingConfig.stock_mask_total_qty) ? '••••' : totalStockVal.toFixed(0);

    const html = `<!DOCTYPE html>
      <html>
        <head>
          <title>Stock Report - ${shopName}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; margin: 0; }
            .header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #2563eb; }
            .header h1 { font-size: 24px; margin: 0; color: #1a1a1a; }
            .header p { font-size: 12px; color: #666; margin: 3px 0; }
            .summary-row { display: flex; gap: 12px; margin-bottom: 20px; }
            .summary-card { flex: 1; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
            .summary-card .value { font-size: 20px; font-weight: 800; }
            .summary-card .label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th { background: #f3f4f6; text-align: left; padding: 7px 6px; border: 1px solid #d1d5db; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
            td { padding: 5px 6px; border: 1px solid #e5e7eb; }
            .cat-header { background: #eff6ff; font-weight: 700; font-size: 11px; color: #2563eb; }
            .cat-header td { padding: 7px 6px; }
            .total-row { background: #f9fafb; font-weight: 800; }
            .total-row td { padding: 8px 6px; border-top: 2px solid #d1d5db; }
            .text-right { text-align: right; }
            .footer { text-align: center; font-size: 9px; color: #9ca3af; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${shopName || 'Shop'}</h1>
            <p>Stock Report &mdash; ${new Date().toLocaleDateString('en-IN', { timeZone: getStoreTimezone(), day: '2-digit', month: 'long', year: 'numeric' })}</p>
            <p style="font-size:10px;color:#888;">Generated at ${new Date().toLocaleTimeString('en-IN', { timeZone: getStoreTimezone() })}</p>
          </div>\n\n          <div class="summary-row">
            <div class="summary-card"><div class="value">${totalProductsVal}</div><div class="label">Total Products</div></div>
            <div class="summary-card"><div class="value">${displayPrintStock}</div><div class="label">Total Stock</div></div>
            <div class="summary-card"><div class="value" style="color:#059669;">${displayPrintVal}</div><div class="label">Stock Value</div></div>
            <div class="summary-card"><div class="value" style="color:${outOfStockVal > 0 ? '#d97706' : '#059669'};">${outOfStockVal}</div><div class="label">Out of Stock</div></div>
          </div>\n\n          <table>
            <thead>
              <tr>
                ${theadCols}
              </tr>
            </thead>
            <tbody>
              ${categoryRows}
              <tr class="total-row">
                <td colspan="3">Grand Total</td>
                <td class="text-right">${displayPrintStock}</td>
                ${viewMode !== 'estimate' ? `<td class="text-right">${totalGstQty.toFixed(0)}</td>` : ''}
                ${viewMode !== 'gst' ? `<td class="text-right">${totalEstQty.toFixed(0)}</td>` : ''}
                <td class="text-right"></td>
                <td class="text-right"></td>
                <td class="text-right" style="color:#059669;">${displayPrintVal}</td>
              </tr>
            </tbody>
          </table>\n\n          <div class="footer">
            Generated by Nafid POS &mdash; ${new Date().toLocaleString('en-IN')} &middot; Showing all ${totalProductsVal} products
          </div>
        </body>
      </html>`;

    if (isDesktopRuntime()) {
      const printResult = await printingApi.printA4Html(tenantId || 'global', html);
      if (!printResult.success) {
        const pw = window.open('', '_blank');
        if (pw) { pw.document.write(html); pw.document.close(); setTimeout(() => pw.print(), 500); }
      }
    } else {
      const pw = window.open('', '_blank');
      if (pw) { pw.document.write(html); pw.document.close(); setTimeout(() => pw.print(), 500); }
    }
  };

  return { handleDownloadCsv, handlePrint };
}
