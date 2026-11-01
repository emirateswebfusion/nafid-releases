import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import type { Vat201Report } from '../../../../electron/services/vatReportService';

interface VatValidationTabProps {
  report: Vat201Report;
}

export function VatValidationTab({ report }: VatValidationTabProps) {
  const { validationIssues } = report;

  const blocking = validationIssues.filter(i => i.severity === 'BLOCKING');
  const warnings = validationIssues.filter(i => i.severity === 'WARNING');
  const info = validationIssues.filter(i => i.severity === 'INFO');

  if (validationIssues.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-card border border-border flex flex-col items-center justify-center max-w-lg mx-auto shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/20">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-base font-black text-foreground">All FTA Validation Checks Passed</h3>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Your UAE VAT accounting records strictly satisfy all statutory Federal Tax Authority (FTA) requirements:
          valid 15-digit TRN, invoice threshold checks, credit note references, and tax math reconciliation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 shadow-2xs">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-xs">
            <AlertCircle className="w-4 h-4" />
            <span>Blocking Issues</span>
          </div>
          <div className="text-2xl font-black text-foreground mt-1">{blocking.length}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Must be resolved prior to FTA submission</div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 shadow-2xs">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>Compliance Warnings</span>
          </div>
          <div className="text-2xl font-black text-foreground mt-1">{warnings.length}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Recommended corrections for tax audits</div>
        </div>

        <div className="p-4 rounded-2xl bg-sky-500/5 border border-sky-500/20 shadow-2xs">
          <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold text-xs">
            <Info className="w-4 h-4" />
            <span>Informational Notices</span>
          </div>
          <div className="text-2xl font-black text-foreground mt-1">{info.length}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Rounding nuances and minor notices</div>
        </div>
      </div>

      {/* Issues List */}
      <div className="space-y-3">
        {validationIssues.map((issue, idx) => {
          const isBlocking = issue.severity === 'BLOCKING';
          const isWarning = issue.severity === 'WARNING';

          return (
            <div 
              key={`${issue.code}-${idx}`}
              className={`p-4 rounded-2xl border bg-card shadow-xs flex items-start gap-3.5 ${
                isBlocking 
                  ? 'border-rose-500/30 bg-rose-500/5' 
                  : isWarning 
                  ? 'border-amber-500/30 bg-amber-500/5' 
                  : 'border-border'
              }`}
            >
              <div className={`p-2 rounded-xl shrink-0 ${
                isBlocking 
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' 
                  : isWarning 
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' 
                  : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
              }`}>
                {isBlocking ? (
                  <AlertCircle className="w-4 h-4" />
                ) : isWarning ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <Info className="w-4 h-4" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                    isBlocking 
                      ? 'bg-rose-500 text-white' 
                      : isWarning 
                      ? 'bg-amber-500 text-white' 
                      : 'bg-sky-500 text-white'
                  }`}>
                    {issue.severity}
                  </span>
                  <span className="font-mono text-xs font-bold text-foreground">
                    {issue.code}
                  </span>
                  {issue.documentRef && (
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                      Ref: {issue.documentRef}
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground mt-1.5 font-medium leading-relaxed">
                  {issue.message}
                </p>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
