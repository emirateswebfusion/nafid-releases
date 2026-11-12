import { Undo2, AlertCircle } from 'lucide-react';
import { getCurrencyDecimals, getCurrencyPrefix, getDefaultTaxRate, getStoreProfile, isUaeStore } from '../../../utils/localization/storeProfile';
import type { Vat201Report } from '../../../../electron/services/vatReportService';

interface VatCreditNotesTabProps {
  report: Vat201Report;
}

export function VatCreditNotesTab({ report }: VatCreditNotesTabProps) {
  const { creditNotesAudit } = report;

  const totalAdjustedTaxable = creditNotesAudit.reduce((acc, c) => acc + c.taxableAmount, 0);
  const totalAdjustedVat = creditNotesAudit.reduce((acc, c) => acc + c.vatAmount, 0);
  const totalRefund = creditNotesAudit.reduce((acc, c) => acc + c.grandTotal, 0);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      
      {/* Informational banner */}
      <div className="p-4 rounded-2xl bg-card border border-border flex items-start gap-3 shadow-xs">
        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
          <Undo2 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xs font-black text-foreground">Tax Credit Notes &amp; Sales Adjustments</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            FTA Article 60 requires every Tax Credit Note to specify the reason for the amendment and reference the
            original Tax Invoice. Tax adjustments automatically deduct from Box 1 output liabilities.
          </p>
        </div>
      </div>

      {/* Credit Notes Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur-xs z-10">
              <tr className="border-b border-border text-muted-foreground font-bold">
                <th className="py-3 px-4">Credit Note #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Original Invoice Link</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4 text-right">Adjusted Taxable ({getStoreProfile().currency})</th>
                <th className="py-3 px-4 text-right">Adjusted VAT ({getDefaultTaxRate()}%)</th>
                <th className="py-3 px-4 text-right">Total Refund ({getStoreProfile().currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-medium text-foreground">
              {creditNotesAudit.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    No sales returns or credit notes recorded in this period.
                  </td>
                </tr>
              ) : (
                creditNotesAudit.map(cn => (
                  <tr key={cn.returnId} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-amber-600 dark:text-amber-400">
                      {cn.creditNoteNumber}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground font-mono">
                      {cn.returnDate}
                    </td>
                    <td className="py-3 px-4">
                      {cn.originalInvoiceNumber ? (
                        <div>
                          <span className="font-mono font-bold text-foreground">{cn.originalInvoiceNumber}</span>
                          {cn.originalInvoiceDate && (
                            <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">({cn.originalInvoiceDate})</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Missing Original Link</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-foreground">{cn.customerName}</div>
                      {cn.customerTrn && (
                        <div className="font-mono text-[10px] text-muted-foreground">TRN: {cn.customerTrn}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                      -{cn.taxableAmount.toFixed(getCurrencyDecimals())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-600 dark:text-amber-400 font-bold">
                      -{cn.vatAmount.toFixed(getCurrencyDecimals())}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-foreground">
                      {cn.grandTotal.toFixed(getCurrencyDecimals())}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {creditNotesAudit.length > 0 && (
              <tfoot className="sticky bottom-0 bg-muted/95 backdrop-blur-xs border-t-2 border-border font-black text-foreground">
                <tr>
                  <td colSpan={4} className="py-3 px-4 font-bold">
                    Total Adjustments ({creditNotesAudit.length} Credit Notes)
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                    -{getCurrencyPrefix()}{totalAdjustedTaxable.toLocaleString('en-US', { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-amber-600 dark:text-amber-400 font-bold">
                    -{getCurrencyPrefix()}{totalAdjustedVat.toLocaleString('en-US', { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() })}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-foreground font-black">
                    {getCurrencyPrefix()}{totalRefund.toLocaleString('en-US', { minimumFractionDigits: getCurrencyDecimals(), maximumFractionDigits: getCurrencyDecimals() })}
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
