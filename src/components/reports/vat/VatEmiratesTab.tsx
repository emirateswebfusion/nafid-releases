import { MapPin } from 'lucide-react';
import type { Vat201Report } from '../../../../electron/services/vatReportService';

interface VatEmiratesTabProps {
  report: Vat201Report;
}

export function VatEmiratesTab({ report }: VatEmiratesTabProps) {
  const supplies = report.section1Output.standardRatedSupplies;

  const rows = [
    { code: '1a', emirate: 'Abu Dhabi', data: supplies.abuDhabi },
    { code: '1b', emirate: 'Dubai', data: supplies.dubai },
    { code: '1c', emirate: 'Sharjah', data: supplies.sharjah },
    { code: '1d', emirate: 'Ajman', data: supplies.ajman },
    { code: '1e', emirate: 'Umm Al Quwain', data: supplies.ummAlQuwain },
    { code: '1f', emirate: 'Ras Al Khaimah', data: supplies.rasAlKhaimah },
    { code: '1g', emirate: 'Fujairah', data: supplies.fujairah },
  ];

  const totalAmount = rows.reduce((acc, r) => acc + r.data.amount, 0);
  const totalVat = rows.reduce((acc, r) => acc + r.data.vatAmount, 0);
  const totalAdjVat = rows.reduce((acc, r) => acc + r.data.adjustmentVat, 0);
  const netTotalVat = totalVat - totalAdjVat;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Informational banner */}
      <div className="p-4 rounded-2xl bg-card border border-border flex items-start gap-3 shadow-xs">
        <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
          <MapPin className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xs font-black text-foreground">Box 1 • Emirate-level Statutory Allocation</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Under UAE Federal Decree-Law No. (8) of 2017, taxable persons must report standard rated supplies (5%)
            according to the Emirate in which the fixed establishment is located or where supplies are performed.
            Credit Notes are recorded in the Adjustments column.
          </p>
        </div>
      </div>

      {/* Emirates Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground font-bold">
                <th className="py-3 px-4 w-20">Box #</th>
                <th className="py-3 px-4">Emirate</th>
                <th className="py-3 px-4 text-right">Standard Supplies (AED)</th>
                <th className="py-3 px-4 text-right">VAT Amount (5%)</th>
                <th className="py-3 px-4 text-right">Credit Adjustments</th>
                <th className="py-3 px-4 text-right">Net Output VAT (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-medium text-foreground">
              {rows.map(r => {
                const netVat = r.data.vatAmount - r.data.adjustmentVat;
                const isSelectedStoreEmirate = report.taxablePerson.emirate.toLowerCase() === r.emirate.toLowerCase().replace(/\s+/g, '_');

                return (
                  <tr 
                    key={r.code}
                    className={`hover:bg-muted/30 transition-colors ${
                      isSelectedStoreEmirate ? 'bg-primary/5 font-semibold' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-primary">{r.code}</td>
                    <td className="py-3.5 px-4 font-bold flex items-center gap-2">
                      <span>{r.emirate}</span>
                      {isSelectedStoreEmirate && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                          Store Location
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">
                      {r.data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-teal-600 dark:text-teal-400 font-bold">
                      {r.data.vatAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                      {r.data.adjustmentVat > 0 ? `-${r.data.adjustmentVat.toFixed(2)}` : '0.00'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-black text-foreground">
                      {netVat.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}

              {/* Total Row */}
              <tr className="bg-muted/50 font-black text-foreground border-t-2 border-border">
                <td className="py-4 px-4 font-mono text-primary font-black" colSpan={2}>
                  Total Box 1 Standard Rated Supplies
                </td>
                <td className="py-4 px-4 text-right font-mono font-bold">
                  AED {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-4 px-4 text-right font-mono text-teal-600 dark:text-teal-400 font-black">
                  AED {totalVat.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-4 px-4 text-right font-mono text-muted-foreground font-bold">
                  {totalAdjVat > 0 ? `-AED ${totalAdjVat.toFixed(2)}` : 'AED 0.00'}
                </td>
                <td className="py-4 px-4 text-right font-mono text-primary font-black">
                  AED {netTotalVat.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
