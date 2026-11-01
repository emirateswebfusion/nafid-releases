import { 
  Receipt, Landmark, CreditCard,
  AlertTriangle, FileCheck2, ArrowUpRight, CheckCircle2,
  FileSpreadsheet, FileCode
} from 'lucide-react';
import { formatCurrency } from '../../../utils/pricing/money';
import type { Gstr1Report } from '../../../../electron/services/gstReportService';
import type { GstTabType } from './useGstReport';

interface GstSummaryTabProps {
  report: Gstr1Report;
  shopGstin: string;
  onNavigateTab: (tab: GstTabType) => void;
  onExportJson: () => void;
  onExportExcel: () => void;
}

export function GstSummaryTab({
  report,
  shopGstin,
  onNavigateTab,
  onExportJson,
  onExportExcel,
}: GstSummaryTabProps) {
  const s = report.summary;
  const blockingCount = report.validation_issues.filter(i => i.severity === 'BLOCKING').length;
  const warningCount = report.validation_issues.filter(i => i.severity === 'WARNING').length;

  // Rate-wise aggregation from B2CS, B2B, B2CL
  const rateBreakdownMap = new Map<number, { taxable: number; igst: number; cgst: number; sgst: number }>();
  const addRateRow = (rate: number, taxable: number, igst: number, cgst: number, sgst: number) => {
    const existing = rateBreakdownMap.get(rate);
    if (existing) {
      existing.taxable += taxable;
      existing.igst += igst;
      existing.cgst += cgst;
      existing.sgst += sgst;
    } else {
      rateBreakdownMap.set(rate, { taxable, igst, cgst, sgst });
    }
  };

  // From B2CS
  for (const row of report.b2cs) {
    addRateRow(row.applicable_tax_rate, row.taxable_value, row.igst, row.cgst, row.sgst);
  }
  // From B2B
  for (const inv of report.b2b) {
    const totalTax = inv.igst + inv.cgst + inv.sgst;
    const rate = inv.taxable_value > 0 ? Math.round((totalTax / inv.taxable_value) * 100) : 0;
    addRateRow(rate, inv.taxable_value, inv.igst, inv.cgst, inv.sgst);
  }
  // From B2CL
  for (const inv of report.b2cl) {
    addRateRow(inv.applicable_tax_rate, inv.taxable_value, inv.igst, 0, 0);
  }

  const rateRows = Array.from(rateBreakdownMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([rate, vals]) => ({
      rate,
      ...vals,
      totalTax: vals.igst + vals.cgst + vals.sgst,
    }));

  return (
    <div className="space-y-6">
      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Invoices */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-border/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Invoices Issued
            </span>
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tracking-tight text-foreground">
              {s.total_invoices}
            </span>
            <span className="text-xs text-muted-foreground font-medium">inward vouchers</span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Gross Sales Value</span>
            <span className="font-mono font-semibold text-foreground">{formatCurrency(s.total_invoice_value)}</span>
          </div>
        </div>

        {/* Card 2: Taxable Base Turnover */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-border/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Taxable Turnover
            </span>
            <div className="h-8 w-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tracking-tight text-foreground">
              {formatCurrency(s.total_taxable_value)}
            </span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Base before GST assessment</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Net Base</span>
          </div>
        </div>

        {/* Card 3: Total Output Tax Collected */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-border/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Output GST
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatCurrency(s.total_tax)}
            </span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>CGST + SGST + IGST</span>
            <span className="font-mono font-semibold text-foreground">Output Liability</span>
          </div>
        </div>

        {/* Card 4: Credit Notes & Deductions */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-border/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Credit Notes / Returns
            </span>
            <div className="h-8 w-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tracking-tight text-rose-600 dark:text-rose-400">
              {formatCurrency(s.credit_note_value)}
            </span>
            <span className="text-xs text-muted-foreground font-medium">({s.total_credit_notes} docs)</span>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Table 9B statutory adjustment</span>
            <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">Deduction</span>
          </div>
        </div>
      </div>

      {/* Tax Liability Breakdown Grid */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 border-b border-border">
          <div>
            <h3 className="text-sm font-bold text-foreground">Statutory Output Tax Breakdown</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Component-wise output tax liability for the chosen filing period</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Store GSTIN:</span>
            <span className="px-2 py-0.5 rounded-md bg-muted text-foreground font-mono font-bold text-xs border border-border">
              {shopGstin || 'Unregistered / Not Set'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase">Central Tax (CGST)</div>
            <div className="mt-2 text-xl font-black font-mono text-foreground">{formatCurrency(s.total_cgst)}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Intra-state supply share</p>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase">State Tax (SGST)</div>
            <div className="mt-2 text-xl font-black font-mono text-foreground">{formatCurrency(s.total_sgst)}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Intra-state state share</p>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase">Integrated Tax (IGST)</div>
            <div className="mt-2 text-xl font-black font-mono text-foreground">{formatCurrency(s.total_igst)}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Inter-state supply tax</p>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Net Tax Payable</div>
            <div className="mt-2 text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
              {formatCurrency(s.total_tax)}
            </div>
            <p className="mt-1 text-[11px] text-emerald-600/80 dark:text-emerald-400/80">Total GSTR-1 output tax</p>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Rate Distribution & Statutory Filing Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Rate-wise distribution */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Tax Rate Distribution</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Aggregated taxable value & tax liability grouped by tax slab</p>
            </div>
            <span className="text-xs font-mono font-medium text-muted-foreground">
              {rateRows.length} rate slab{rateRows.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Tax Slab</th>
                  <th className="px-4 py-3 text-right">Taxable Turnover</th>
                  <th className="px-4 py-3 text-right">CGST</th>
                  <th className="px-4 py-3 text-right">SGST</th>
                  <th className="px-4 py-3 text-right">IGST</th>
                  <th className="px-5 py-3 text-right">Total Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {rateRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground font-sans text-xs">
                      No tax-bearing invoices found for this filing period.
                    </td>
                  </tr>
                ) : (
                  rateRows.map(row => (
                    <tr key={row.rate} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-bold text-foreground">
                        <span className="px-2 py-0.5 rounded-md bg-muted text-foreground border border-border">
                          {row.rate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(row.taxable)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(row.cgst)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(row.sgst)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(row.igst)}</td>
                      <td className="px-5 py-3 text-right font-bold text-foreground">{formatCurrency(row.totalTax)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {rateRows.length > 0 && (
                <tfoot className="bg-muted/30 border-t border-border font-mono font-bold text-xs">
                  <tr>
                    <td className="px-5 py-3 text-foreground font-sans">Total</td>
                    <td className="px-4 py-3 text-right text-foreground">{formatCurrency(s.total_taxable_value)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(s.total_cgst)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(s.total_sgst)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(s.total_igst)}</td>
                    <td className="px-5 py-3 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(s.total_tax)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Right 1 Col: Filing Readiness & Quick Exports */}
        <div className="space-y-6">
          {/* Readiness Box */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <h3 className="text-sm font-bold text-foreground">Filing Audit & Integrity</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Pre-upload statutory compliance check</p>

            <div className="mt-4 space-y-3">
              {blockingCount > 0 ? (
                <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold">Blocking Issues Found ({blockingCount})</p>
                    <p className="mt-0.5 opacity-90">Invalid GSTINs or data corruptions will cause GST offline tool validation errors.</p>
                    <button
                      onClick={() => onNavigateTab('validation')}
                      className="mt-2 text-[11px] font-bold underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      Review Issues <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : warningCount > 0 ? (
                <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold">Warnings Noted ({warningCount})</p>
                    <p className="mt-0.5 opacity-90">Minor discrepancies detected, such as missing invoice links on credit notes.</p>
                    <button
                      onClick={() => onNavigateTab('validation')}
                      className="mt-2 text-[11px] font-bold underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      Review Warnings <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold">Zero Statutory Violations</p>
                    <p className="mt-0.5 opacity-90">All tax headers, customer GSTIN formats, and document sequences are valid.</p>
                  </div>
                </div>
              )}

              {/* Statutory Checklist */}
              <div className="space-y-2 pt-2 border-t border-border/60 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" /> Table 4 B2B Invoices
                  </span>
                  <span className="font-mono font-bold text-foreground">{report.b2b.length}</span>
                </div>

                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" /> Table 7 B2CS Retail Supplies
                  </span>
                  <span className="font-mono font-bold text-foreground">{report.b2cs.length}</span>
                </div>

                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" /> Table 12 HSN Classifications
                  </span>
                  <span className="font-mono font-bold text-foreground">{report.hsn.length}</span>
                </div>

                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" /> Table 13 Document Series
                  </span>
                  <span className="font-mono font-bold text-foreground">{report.doc_issue.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Export Buttons */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-foreground">Statutory Exports</h3>
            <p className="text-xs text-muted-foreground">Download reports formatted directly for GST offline tools.</p>

            <button
              onClick={onExportJson}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-xs active:scale-[0.98] cursor-pointer"
            >
              <FileCode className="w-4 h-4" />
              Download Official Portal JSON
            </button>

            <button
              onClick={onExportExcel}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-600/30 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 font-bold text-xs transition-all shadow-xs active:scale-[0.98] cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Export Multi-Tab Excel (.xlsx)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
