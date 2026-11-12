import { useState, useMemo } from 'react';
import { getCurrencyDecimals, getCurrencyPrefix, getDefaultTaxRate, getStoreProfile, isUaeStore } from '../../../utils/localization/storeProfile';
import { Search, Building2, User } from 'lucide-react';
import type { Vat201Report } from '../../../../electron/services/vatReportService';

interface VatSalesTabProps {
  report: Vat201Report;
}

export function VatSalesTab({ report }: VatSalesTabProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'FULL' | 'SIMPLIFIED'>('ALL');

  const filtered = useMemo(() => {
    return report.salesAudit.filter(inv => {
      if (filterType === 'FULL' && inv.invoiceType !== 'FULL') return false;
      if (filterType === 'SIMPLIFIED' && inv.invoiceType !== 'SIMPLIFIED') return false;

      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        (inv.customerTrn && inv.customerTrn.includes(q))
      );
    });
  }, [report.salesAudit, search, filterType]);

  const totalFilteredTaxable = filtered.reduce((acc, i) => acc + i.taxableAmount, 0);
  const totalFilteredVat = filtered.reduce((acc, i) => acc + i.vatAmount, 0);
  const totalFilteredGrand = filtered.reduce((acc, i) => acc + i.grandTotal, 0);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      
      {/* Search and Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border shadow-xs">
        {/* Left: Search input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search invoice number, customer name, or TRN..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-muted/40 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>

        {/* Right: Filter Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterType === 'ALL'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            All Invoices ({report.salesAudit.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('FULL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterType === 'FULL'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            Full Tax ({report.salesAudit.filter(i => i.invoiceType === 'FULL').length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('SIMPLIFIED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterType === 'SIMPLIFIED'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            Simplified ({report.salesAudit.filter(i => i.invoiceType === 'SIMPLIFIED').length})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur-xs z-10">
              <tr className="border-b border-border text-muted-foreground font-bold">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Customer Details</th>
                <th className="py-3 px-4">Invoice Type</th>
                {isUaeStore() && <th className="py-3 px-4">Emirate</th>}
                <th className="py-3 px-4 text-right">Taxable ({getStoreProfile().currency})</th>
                <th className="py-3 px-4 text-right">VAT ({getDefaultTaxRate()}%)</th>
                <th className="py-3 px-4 text-right">Grand Total ({getStoreProfile().currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-medium text-foreground">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    No sales invoices found matching the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map(inv => (
                  <tr key={inv.invoiceId} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-primary">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground font-mono">
                      {inv.invoiceDate}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold flex items-center gap-1.5">
                        {inv.customerTrn ? (
                          <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate max-w-[180px]">{inv.customerName}</span>
                      </div>
                      {inv.customerTrn && (
                        <div className="font-mono text-[10px] text-muted-foreground font-semibold">
                          TRN: {inv.customerTrn}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        inv.invoiceType === 'FULL'
                          ? 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {inv.invoiceType === 'FULL' ? 'Full Tax' : 'Simplified'}
                      </span>
                    </td>
                    {isUaeStore() && <td className="py-3 px-4 text-muted-foreground font-medium">{inv.emirate}</td>}
                    <td className="py-3 px-4 text-right font-mono font-semibold">
                      {inv.taxableAmount.toFixed(getCurrencyDecimals())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-teal-600 dark:text-teal-400 font-bold">
                      {inv.vatAmount.toFixed(getCurrencyDecimals())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-foreground">
                      {inv.grandTotal.toFixed(getCurrencyDecimals())}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="sticky bottom-0 bg-muted/95 backdrop-blur-xs border-t-2 border-border font-black text-foreground">
                <tr>
                  <td colSpan={isUaeStore() ? 5 : 4} className="py-3 px-4 font-bold">
                    Filtered Total ({filtered.length} invoices)
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {getCurrencyPrefix()}{totalFilteredTaxable.toLocaleString('en-US', { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-teal-600 dark:text-teal-400 font-bold">
                    {getCurrencyPrefix()}{totalFilteredVat.toLocaleString('en-US', { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-primary font-black">
                    {getCurrencyPrefix()}{totalFilteredGrand.toLocaleString('en-US', { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() })}
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
