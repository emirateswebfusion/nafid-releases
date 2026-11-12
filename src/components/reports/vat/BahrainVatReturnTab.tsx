import type { Vat201Report } from '../../../../electron/services/vatReportService';
import { buildBahrainVatReturn, type BahrainVatLine } from '../../../utils/pricing/bahrainVatReturn';
import { formatAmount, formatCurrency } from '../../../utils/pricing/money';

function Section({ title, lines, showAmount }: { title: string; lines: BahrainVatLine[]; showAmount: boolean }) {
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="px-4 py-2.5 text-xs font-black uppercase tracking-wider text-muted-foreground border-b border-border">{title}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase text-muted-foreground">
            <th className="px-4 py-2 text-left w-16">Box</th>
            <th className="px-2 py-2 text-left">Description</th>
            {showAmount && <th className="px-4 py-2 text-right w-40">Amount (BHD)</th>}
            <th className="px-4 py-2 text-right w-40">VAT amount (BHD)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(row => (
            <tr key={row.box} className={row.total ? 'border-t border-border font-black bg-muted/40' : 'border-t border-border/50'}>
              <td className="px-4 py-2 font-mono font-bold">{row.box}</td>
              <td className="px-2 py-2">
                {row.label}
                {!row.recorded && <span className="ml-2 text-[10px] font-semibold text-muted-foreground">not recorded in Nafid; enter on the NBR portal if it applies</span>}
              </td>
              {showAmount && <td className="px-4 py-2 text-right font-mono">{formatAmount(row.amount)}</td>}
              <td className="px-4 py-2 text-right font-mono">{formatAmount(row.vat)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bahrain NBR VAT return view: the period figures on the lines of the NBR return form. */
export function BahrainVatReturnTab({ report }: { report: Vat201Report }) {
  const vatReturn = buildBahrainVatReturn(report);
  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-200">
      <div className="p-4 rounded-2xl bg-card border border-border flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-muted-foreground">
            Period: {report.period.fromDate} to {report.period.toDate} • VAT Account No.: {report.taxablePerson.trn || 'Not configured'}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Box numbers follow the NBR VAT return form. Compare with the form on the NBR portal before filing; this report prepares the figures, it does not file the return.
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Box 18 • {vatReturn.status === 'RECLAIMABLE' ? 'VAT reclaimable' : 'Net VAT due'}</div>
          <div className="text-2xl font-black tracking-tight">{formatCurrency(Math.abs(vatReturn.netVat))}</div>
        </div>
      </div>
      <Section title="VAT on sales" lines={vatReturn.sales} showAmount />
      <Section title="VAT on purchases" lines={vatReturn.purchases} showAmount />
      <Section title="Net VAT due" lines={vatReturn.totals} showAmount={false} />
    </div>
  );
}
