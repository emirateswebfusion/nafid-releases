import { useState, useMemo } from 'react';
import { getCurrencyDecimals, getCurrencyPrefix, getDefaultTaxRate, getStoreProfile, isUaeStore } from '../../../utils/localization/storeProfile';
import { Search, Building2 } from 'lucide-react';
import type { Vat201Report } from '../../../../electron/services/vatReportService';

interface VatPurchasesTabProps {
  report: Vat201Report;
}

export function VatPurchasesTab({ report }: VatPurchasesTabProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return report.purchaseAudit;
    const q = search.trim().toLowerCase();
    return report.purchaseAudit.filter(p => 
      p.billNumber.toLowerCase().includes(q) ||
      (p.supplierInvoiceNumber && p.supplierInvoiceNumber.toLowerCase().includes(q)) ||
      p.supplierName.toLowerCase().includes(q) ||
      (p.supplierTrn && p.supplierTrn.includes(q))
    );
  }, [report.purchaseAudit, search]);

  const totalTaxable = filtered.reduce((acc, p) => acc + p.taxableAmount, 0);
  const totalInputVat = filtered.reduce((acc, p) => acc + p.vatAmount, 0);
  const totalGrand = filtered.reduce((acc, p) => acc + p.grandTotal, 0);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      
      {/* Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border shadow-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search purchase bill #, supplier name, or TRN..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-muted/40 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div className="text-xs font-bold text-muted-foreground">
          Showing {filtered.length} of {report.purchaseAudit.length} purchase bills
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur-xs z-10">
              <tr className="border-b border-border text-muted-foreground font-bold">
                <th className="py-3 px-4">Bill #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Supplier Invoice #</th>
                <th className="py-3 px-4">Supplier Details</th>
                <th className="py-3 px-4 text-right">Net Taxable ({getStoreProfile().currency})</th>
                <th className="py-3 px-4 text-right">Recoverable VAT ({getDefaultTaxRate()}%)</th>
                <th className="py-3 px-4 text-right">Grand Total ({getStoreProfile().currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-medium text-foreground">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    No purchase bills found in this period.
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.purchaseBillId} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {p.billNumber}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground font-mono">
                      {p.billDate}
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {p.supplierInvoiceNumber || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold flex items-center gap-1.5 text-foreground">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{p.supplierName}</span>
                      </div>
                      {p.supplierTrn ? (
                        <div className="font-mono text-[10px] text-muted-foreground">TRN: {p.supplierTrn}</div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground/70 italic">Unregistered supplier</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">
                      {p.taxableAmount.toFixed(getCurrencyDecimals())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {p.vatAmount.toFixed(getCurrencyDecimals())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-foreground">
                      {p.grandTotal.toFixed(getCurrencyDecimals())}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="sticky bottom-0 bg-muted/95 backdrop-blur-xs border-t-2 border-border font-black text-foreground">
                <tr>
                  <td colSpan={4} className="py-3 px-4 font-bold">
                    Box 9 Input Tax Total ({filtered.length} Bills)
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {getCurrencyPrefix()}{totalTaxable.toLocaleString('en-US', { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {getCurrencyPrefix()}{totalInputVat.toLocaleString('en-US', { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-foreground font-black">
                    {getCurrencyPrefix()}{totalGrand.toLocaleString('en-US', { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
}
