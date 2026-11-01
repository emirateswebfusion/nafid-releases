import { 
  ArrowUpRight, ArrowDownLeft, Scale, AlertTriangle, CheckCircle2 
} from 'lucide-react';
import type { Vat201Report } from '../../../../electron/services/vatReportService';

interface Vat201ReturnTabProps {
  report: Vat201Report;
  onNavigateTab: (tab: 'emirates' | 'sales' | 'credit_notes' | 'purchases' | 'validation') => void;
}

export function Vat201ReturnTab({ report, onNavigateTab }: Vat201ReturnTabProps) {
  const { section1Output, section2Input, netDue, summary, validationIssues } = report;
  const blockingCount = validationIssues.filter(i => i.severity === 'BLOCKING').length;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      
      {/* 1. Executive Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Output VAT */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-bold mb-2">
            <span>Box 8 • Output VAT</span>
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-foreground tracking-tight">
            AED {section1Output.totalOutputTax.netOutputVatDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-muted-foreground font-semibold mt-1">
            Standard 5% on AED {section1Output.totalOutputTax.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} sales
          </div>
        </div>

        {/* Input VAT */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-bold mb-2">
            <span>Box 11 • Recoverable Input VAT</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-foreground tracking-tight">
            AED {section2Input.totalInputTax.netInputVatRecoverable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-muted-foreground font-semibold mt-1">
            From {summary.totalPurchaseBills} purchase bills (AED {summary.grossPurchases.toLocaleString('en-US', { minimumFractionDigits: 2 })})
          </div>
        </div>

        {/* Net VAT Due */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-bold mb-2">
            <span>Box 14 • Net VAT Status</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground tracking-tight">
              AED {netDue.netVatPayable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
              netDue.status === 'PAYABLE' 
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' 
                : netDue.status === 'RECLAIMABLE'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-muted text-muted-foreground'
            }`}>
              {netDue.status === 'PAYABLE' ? 'Payable to FTA' : netDue.status === 'RECLAIMABLE' ? 'Reclaimable' : 'Nil'}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground font-semibold mt-1">
            Box 12 ({section1Output.totalOutputTax.netOutputVatDue.toFixed(2)}) − Box 13 ({section2Input.totalInputTax.netInputVatRecoverable.toFixed(2)})
          </div>
        </div>

        {/* Validation Status */}
        <div 
          onClick={() => onNavigateTab('validation')}
          className="p-4 rounded-2xl bg-card border border-border shadow-xs cursor-pointer hover:border-primary/50 transition-all"
        >
          <div className="flex items-center justify-between text-muted-foreground text-xs font-bold mb-2">
            <span>FTA Audit Validation</span>
            {blockingCount > 0 ? (
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            ) : (
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            )}
          </div>
          <div className="text-2xl font-black text-foreground tracking-tight">
            {blockingCount > 0 ? `${blockingCount} Issues` : 'Audit Ready'}
          </div>
          <div className="text-[11px] text-muted-foreground font-semibold mt-1">
            {validationIssues.length === 0 ? 'All 15-digit TRN & checks passed' : `${validationIssues.length} total checks • Click to inspect`}
          </div>
        </div>
      </div>

      {/* 2. Official VAT 201 Return Schedule Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-foreground">Federal Tax Authority • Form VAT 201 Return Schedule</h2>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Period: {report.period.fromDate} to {report.period.toDate} • Taxable Person TRN: {report.taxablePerson.trn || 'Not Configured'}
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-black bg-primary/10 text-primary border border-primary/20">
            UAE FTA Compliant
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-muted-foreground font-bold">
                <th className="py-3 px-4 w-16">Box #</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right w-40">Amount (AED)</th>
                <th className="py-3 px-4 text-right w-40">VAT Amount (AED)</th>
                <th className="py-3 px-4 text-right w-40">Adjustments (AED)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-medium text-foreground">
              {/* Section 1 Header */}
              <tr className="bg-muted/40 text-foreground font-black">
                <td colSpan={5} className="py-2.5 px-4 text-[11px] uppercase tracking-wider">
                  Section 1: VAT on Sales and all other Outputs
                </td>
              </tr>
              {/* Box 1 Standard Rated */}
              <tr 
                onClick={() => onNavigateTab('emirates')} 
                className="hover:bg-muted/30 transition-colors cursor-pointer group"
              >
                <td className="py-3 px-4 font-mono font-bold text-primary group-hover:underline">Box 1</td>
                <td className="py-3 px-4">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>Standard rated supplies (by Emirate breakdown)</span>
                    <span className="text-[10px] text-muted-foreground font-normal">(Click to view 7 Emirates)</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold">
                  {section1Output.totalOutputTax.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-teal-600 dark:text-teal-400">
                  {section1Output.totalOutputTax.totalVat.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                  {section1Output.totalOutputTax.totalAdjustmentVat > 0 
                    ? `-${section1Output.totalOutputTax.totalAdjustmentVat.toFixed(2)}` 
                    : '0.00'}
                </td>
              </tr>
              {/* Box 2 */}
              <tr>
                <td className="py-2.5 px-4 font-mono text-muted-foreground">Box 2</td>
                <td className="py-2.5 px-4 text-muted-foreground">Tax Refunds for Tourists Scheme</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
              </tr>
              {/* Box 3 */}
              <tr>
                <td className="py-2.5 px-4 font-mono text-muted-foreground">Box 3</td>
                <td className="py-2.5 px-4 text-muted-foreground">Supplies subject to the reverse charge provisions</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
              </tr>
              {/* Box 4 */}
              <tr>
                <td className="py-2.5 px-4 font-mono text-muted-foreground">Box 4</td>
                <td className="py-2.5 px-4">Zero rated supplies</td>
                <td className="py-2.5 px-4 text-right font-mono">
                  {section1Output.zeroRatedSupplies.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">—</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
              </tr>
              {/* Box 5 */}
              <tr>
                <td className="py-2.5 px-4 font-mono text-muted-foreground">Box 5</td>
                <td className="py-2.5 px-4">Exempt supplies</td>
                <td className="py-2.5 px-4 text-right font-mono">
                  {section1Output.exemptSupplies.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">—</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
              </tr>
              {/* Box 6 & 7 */}
              <tr>
                <td className="py-2.5 px-4 font-mono text-muted-foreground">Box 6 &amp; 7</td>
                <td className="py-2.5 px-4 text-muted-foreground">Goods imported into the UAE and adjustments</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
              </tr>
              {/* Box 8 Total */}
              <tr className="bg-teal-500/5 font-black text-foreground">
                <td className="py-3 px-4 font-mono text-teal-600 dark:text-teal-400">Box 8</td>
                <td className="py-3 px-4 font-bold">Total value of due tax for output</td>
                <td className="py-3 px-4 text-right font-mono">
                  {section1Output.totalOutputTax.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-mono text-teal-600 dark:text-teal-400">
                  {section1Output.totalOutputTax.netOutputVatDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                  {section1Output.totalOutputTax.totalAdjustmentVat > 0 
                    ? `-${section1Output.totalOutputTax.totalAdjustmentVat.toFixed(2)}` 
                    : '0.00'}
                </td>
              </tr>

              {/* Section 2 Header */}
              <tr className="bg-muted/40 text-foreground font-black">
                <td colSpan={5} className="py-2.5 px-4 text-[11px] uppercase tracking-wider">
                  Section 2: VAT on Expenses and all other Inputs
                </td>
              </tr>
              {/* Box 9 */}
              <tr 
                onClick={() => onNavigateTab('purchases')} 
                className="hover:bg-muted/30 transition-colors cursor-pointer group"
              >
                <td className="py-3 px-4 font-mono font-bold text-primary group-hover:underline">Box 9</td>
                <td className="py-3 px-4">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>Standard rated expenses / purchases</span>
                    <span className="text-[10px] text-muted-foreground font-normal">(Click to view Purchases)</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold">
                  {section2Input.standardRatedExpenses.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {section2Input.standardRatedExpenses.vatAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-mono text-muted-foreground">0.00</td>
              </tr>
              {/* Box 10 */}
              <tr>
                <td className="py-2.5 px-4 font-mono text-muted-foreground">Box 10</td>
                <td className="py-2.5 px-4 text-muted-foreground">Supplies subject to the reverse charge provisions</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">0.00</td>
              </tr>
              {/* Box 11 Total */}
              <tr className="bg-emerald-500/5 font-black text-foreground">
                <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400">Box 11</td>
                <td className="py-3 px-4 font-bold">Total value of recoverable input tax</td>
                <td className="py-3 px-4 text-right font-mono">
                  {section2Input.totalInputTax.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                  {section2Input.totalInputTax.netInputVatRecoverable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-mono text-muted-foreground">0.00</td>
              </tr>

              {/* Section 3 Header */}
              <tr className="bg-muted/40 text-foreground font-black">
                <td colSpan={5} className="py-2.5 px-4 text-[11px] uppercase tracking-wider">
                  Section 3: Net VAT Due / Reclaimable
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold">Box 12</td>
                <td className="py-2.5 px-4 font-semibold">Total value of due tax for the period (Box 8)</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">—</td>
                <td className="py-2.5 px-4 text-right font-mono font-bold text-foreground">
                  AED {netDue.totalDueTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">—</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono font-bold">Box 13</td>
                <td className="py-2.5 px-4 font-semibold">Total value of recoverable tax for the period (Box 11)</td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">—</td>
                <td className="py-2.5 px-4 text-right font-mono font-bold text-foreground">
                  AED {netDue.totalRecoverableTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">—</td>
              </tr>
              <tr className="bg-primary/5 font-black text-base text-foreground">
                <td className="py-4 px-4 font-mono text-primary font-black">Box 14</td>
                <td className="py-4 px-4">
                  <div className="flex items-center gap-2">
                    <span>Payable Tax for the Period</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                      netDue.status === 'PAYABLE' 
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' 
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {netDue.status === 'PAYABLE' ? 'Net Payable to FTA' : 'Reclaimable Credit'}
                    </span>
                  </div>
                </td>
                <td className="py-4 px-4 text-right font-mono text-muted-foreground">—</td>
                <td className="py-4 px-4 text-right font-mono font-black text-primary text-base">
                  AED {netDue.netVatPayable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-4 px-4 text-right font-mono text-muted-foreground">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
