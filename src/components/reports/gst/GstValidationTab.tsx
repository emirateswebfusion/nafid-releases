import { AlertTriangle, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { ValidationIssue } from '../../../../electron/services/gstReportService';

interface GstValidationTabProps {
  issues: ValidationIssue[];
}

export function GstValidationTab({ issues }: GstValidationTabProps) {
  const blockingIssues = issues.filter(i => i.severity === 'BLOCKING');
  const warningIssues = issues.filter(i => i.severity === 'WARNING');
  const infoIssues = issues.filter(i => i.severity === 'INFO');

  if (issues.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-foreground">Zero Compliance Discrepancies</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto leading-relaxed">
          Every customer GSTIN adheres to the 15-character checksum format, all invoice tax headers match the sum of their individual tax lines, and all credit notes reference valid parent sales.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Statutory Audit Passed • Ready for GST Offline Portal Tool</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stat Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black font-mono text-destructive">{blockingIssues.length}</div>
            <div className="text-xs font-semibold text-destructive/80">Blocking Issues (Will fail upload)</div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">{warningIssues.length}</div>
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">Warnings (Audit advisory)</div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black font-mono text-blue-600 dark:text-blue-400">{infoIssues.length}</div>
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">Notices / Observations</div>
          </div>
        </div>
      </div>

      {/* Issues List */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Audit Log & Discrepancy Registry</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Specific records requiring correction in Sales History or Customer Directory</p>
          </div>
          <span className="text-xs font-mono font-bold text-muted-foreground">
            {issues.length} flagged issue{issues.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="divide-y divide-border">
          {issues.map((issue, idx) => (
            <div key={`${issue.invoice_number}-${issue.field}-${idx}`} className="p-4 hover:bg-muted/20 transition-colors flex items-start gap-3.5">
              <div className="mt-0.5 shrink-0">
                {issue.severity === 'BLOCKING' ? (
                  <span className="px-2 py-0.5 rounded-md bg-destructive/15 text-destructive border border-destructive/30 font-bold text-[10px] tracking-wider uppercase">
                    Blocking
                  </span>
                ) : issue.severity === 'WARNING' ? (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold text-[10px] tracking-wider uppercase">
                    Warning
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-bold text-[10px] tracking-wider uppercase">
                    Info
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {issue.invoice_number && (
                    <span className="text-xs font-mono font-bold text-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
                      Doc: {issue.invoice_number}
                    </span>
                  )}
                  <span className="text-xs font-mono text-muted-foreground">
                    Field: <span className="font-semibold text-foreground">{issue.field}</span>
                  </span>
                </div>
                <p className="text-xs text-foreground mt-1.5 font-medium leading-relaxed">
                  {issue.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
