import { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet, FileCode, CheckCircle2,
  Lock, Loader2, RefreshCw, Send, Check
} from 'lucide-react';
import clsx from 'clsx';
import type { Gstr1Report, LocalGstFilingRow } from '../../../../electron/services/gstReportService';
import { gstApi } from '../../../data/gst';
import { gstCloudApi } from '../../../data/cloud/gstCloud';
import { formatCurrency } from '../../../utils/pricing/money';
import { useAuthStore } from '../../../store/authStore';
import { FloatToast, type ToastMessage } from '../../ui/FloatToast';

interface GstComplianceFilingTabProps {
  report: Gstr1Report | null;
  periodLabel: string;
  onExportJson: () => void;
  onExportExcel: () => void;
  shopGstin: string;
}

function formatFilingStatus(status: string): string {
  switch (status) {
    case 'AWAITING_APPROVAL':
      return 'Awaiting Approval';
    case 'APPROVED':
      return 'Approved';
    case 'FILED':
      return 'Filed';
    case 'DRAFT':
    default:
      return 'Draft';
  }
}

function formatFilingMode(mode: string): string {
  switch (mode) {
    case 'OFFLINE_MANUAL':
      return 'Offline Manual';
    case 'OFFLINE_PORTAL':
      return 'Offline Portal';
    case 'MANAGED_GSP':
      return 'Managed GSP';
    case 'SHOP_OWNED_GSP':
      return 'Shop-Owned GSP';
    default:
      return mode ? mode.replace(/_/g, ' ') : '—';
  }
}

function formatReturnType(type: string): string {
  switch (type) {
    case 'GSTR1':
      return 'GSTR-1';
    case 'GSTR3B':
      return 'GSTR-3B';
    default:
      return type;
  }
}

export function GstComplianceFilingTab({
  report,
  periodLabel,
  onExportJson,
  onExportExcel,
  shopGstin,
}: GstComplianceFilingTabProps) {
  const { role, userName } = useAuthStore();
  const isOwnerOrAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const [returnType, setReturnType] = useState<'GSTR1' | 'GSTR3B'>('GSTR1');
  const [localFilings, setLocalFilings] = useState<LocalGstFilingRow[]>([]);
  const [loadingFilings, setLoadingFilings] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Manual filing dialog state
  const [showManualModal, setShowManualModal] = useState(false);
  const [arnInput, setArnInput] = useState('');
  const [filingDateInput, setFilingDateInput] = useState(() => new Date().toISOString().split('T')[0]);

  // Derive taxable & tax from current report
  const taxableValue = report?.summary?.total_taxable_value ?? 0;
  const taxAmount = report?.summary?.total_tax ?? 0;

  const refreshFilings = useCallback(async () => {
    setLoadingFilings(true);
    try {
      const localRes = await gstApi.getLocalGstFilings();
      if (Array.isArray(localRes)) {
        setLocalFilings(localRes);
      }
      try {
        const cloudFilings = await gstCloudApi.getFilings();
        if (Array.isArray(cloudFilings) && cloudFilings.length > 0) {
          const mapped: LocalGstFilingRow[] = cloudFilings.map(c => ({
            id: c.id,
            period: c.filing_period,
            return_type: c.return_type,
            status: c.status as LocalGstFilingRow['status'],
            filing_mode: c.filing_mode as LocalGstFilingRow['filing_mode'],
            acknowledgement_number: c.acknowledgement_number,
            filing_date: c.filing_date,
            gross_taxable_value: c.gross_taxable_value,
            total_tax_amount: c.total_tax_amount,
            approved_by: c.approved_by,
            approved_at: c.approved_at,
            created_at: c.created_at,
            updated_at: c.updated_at,
          }));
          setLocalFilings(mapped);
        }
      } catch {
        // offline fallback
      }
    } catch {
      // ignore
    } finally {
      setLoadingFilings(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const localRes = await gstApi.getLocalGstFilings();
        if (!active) return;
        if (Array.isArray(localRes)) {
          setLocalFilings(localRes);
        }
        try {
          const cloudFilings = await gstCloudApi.getFilings();
          if (!active) return;
          if (Array.isArray(cloudFilings) && cloudFilings.length > 0) {
            const mapped: LocalGstFilingRow[] = cloudFilings.map(c => ({
              id: c.id,
              period: c.filing_period,
              return_type: c.return_type,
              status: c.status as LocalGstFilingRow['status'],
              filing_mode: c.filing_mode as LocalGstFilingRow['filing_mode'],
              acknowledgement_number: c.acknowledgement_number,
              filing_date: c.filing_date,
              gross_taxable_value: c.gross_taxable_value,
              total_tax_amount: c.total_tax_amount,
              approved_by: c.approved_by,
              approved_at: c.approved_at,
              created_at: c.created_at,
              updated_at: c.updated_at,
            }));
            setLocalFilings(mapped);
          }
        } catch {
          // offline fallback
        }
      } catch {
        // ignore
      }
    })();
    return () => { active = false; };
  }, []);

  // Current period active record
  const currentFiling = localFilings.find(
    f => f.period === periodLabel && f.return_type === returnType
  );

  const currentStatus = currentFiling?.status || 'DRAFT';

  const formatIpcError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('No handler registered')) {
      return 'Desktop IPC bridge updated. Please restart NAFID POS (restart npm run dev) so Electron can load the newly compiled database handlers.';
    }
    return msg;
  };

  // Stage for approval
  const handleStageForApproval = async () => {
    setActionLoading(true);
    setToast(null);
    try {
      // Update local SQLite
      await gstApi.upsertLocalGstFiling({
        period: periodLabel,
        return_type: returnType,
        status: 'AWAITING_APPROVAL',
        filing_mode: 'OFFLINE_MANUAL',
        gross_taxable_value: taxableValue,
        total_tax_amount: taxAmount,
      });

      // Try syncing to server
      try {
        await gstCloudApi.prepareFiling({
          period: periodLabel,
          returnType,
          grossTaxable: taxableValue,
          totalTax: taxAmount,
        });
      } catch {
        // offline fallback
      }

      setToast({ text: `${formatReturnType(returnType)} staged for Owner/Admin authorization.`, type: 'success' });
      refreshFilings();
    } catch (err) {
      setToast({ text: formatIpcError(err), type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  // Owner / Admin approval
  const handleApprove = async () => {
    if (!isOwnerOrAdmin) {
      setToast({ text: 'Only Store Owner or Admin can authorize statutory tax filings.', type: 'error' });
      return;
    }
    setActionLoading(true);
    setToast(null);
    try {
      const now = new Date().toISOString();
      await gstApi.upsertLocalGstFiling({
        period: periodLabel,
        return_type: returnType,
        status: 'APPROVED',
        filing_mode: 'OFFLINE_MANUAL',
        gross_taxable_value: taxableValue,
        total_tax_amount: taxAmount,
        approved_by: userName || 'Owner',
        approved_at: now,
      });

      try {
        await gstCloudApi.approveFiling({
          period: periodLabel,
          returnType,
        });
      } catch {
        // offline fallback
      }

      setToast({ text: `${formatReturnType(returnType)} statutory return authorized and approved for filing.`, type: 'success' });
      refreshFilings();
    } catch (err) {
      setToast({ text: formatIpcError(err), type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  // Submit manual portal acknowledgement (ARN)
  const handleRecordManualFiling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arnInput.trim()) {
      setToast({ text: 'Acknowledgement Reference Number (ARN) is mandatory.', type: 'error' });
      return;
    }

    setActionLoading(true);
    setToast(null);
    try {
      const now = new Date().toISOString();
      // Record to local SQLite
      await gstApi.recordLocalManualAcknowledgement({
        period: periodLabel,
        return_type: returnType,
        acknowledgement_number: arnInput.trim(),
        filing_date: filingDateInput,
        gross_taxable_value: taxableValue,
        total_tax_amount: taxAmount,
        approved_by: userName || 'Store Admin',
        approved_at: now,
      });

      // Sync to cloud if online
      try {
        await gstCloudApi.recordManualFiling({
          period: periodLabel,
          returnType,
          arn: arnInput.trim(),
          filingDate: filingDateInput,
          grossTaxable: taxableValue,
          totalTax: taxAmount,
        });
      } catch {
        // offline fallback
      }

      setShowManualModal(false);
      setArnInput('');
      setToast({ text: `Filing acknowledgement recorded: ARN ${arnInput.trim()}`, type: 'success' });
      refreshFilings();
    } catch (err) {
      setToast({ text: formatIpcError(err), type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Return Type & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-border bg-card shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl bg-muted p-1 border border-border">
            <button
              onClick={() => setReturnType('GSTR1')}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                returnType === 'GSTR1'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              GSTR-1 (Outward Supplies)
            </button>
            <button
              onClick={() => setReturnType('GSTR3B')}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                returnType === 'GSTR3B'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              GSTR-3B (Summary Return)
            </button>
          </div>

          <div className="text-xs text-muted-foreground">
            Period: <strong className="text-foreground">{periodLabel}</strong> • GSTIN:{' '}
            <strong className="text-foreground font-mono">{shopGstin || 'Unset'}</strong>
          </div>
        </div>

        {/* Current Lifecycle Status */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Lifecycle Status:</span>
          <span
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5',
              currentStatus === 'FILED' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
              currentStatus === 'APPROVED' && 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
              currentStatus === 'AWAITING_APPROVAL' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
              currentStatus === 'DRAFT' && 'bg-muted text-muted-foreground border-border'
            )}
          >
            {currentStatus === 'FILED' && <CheckCircle2 className="w-3.5 h-3.5" />}
            {formatFilingStatus(currentStatus)}
          </span>
        </div>
      </div>

      {/* Lifecycle Workflow Stepper */}
      <div className="p-5 rounded-2xl border border-border bg-card shadow-xs">
        <h3 className="text-sm font-bold text-foreground mb-4">Statutory Filing Lifecycle</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Step 1: Draft */}
          <div className={clsx(
            'p-3.5 rounded-xl border flex flex-col justify-between transition-all',
            'bg-muted/10 border-border'
          )}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Step 1</span>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <span className="text-xs font-bold text-foreground block">Draft Aggregation</span>
              <span className="text-[11px] text-muted-foreground">Invoices &amp; credit notes calculated</span>
            </div>
            <span className="text-[10px] text-emerald-600 font-bold mt-2">Ready</span>
          </div>

          {/* Step 2: Review / Stage */}
          <div className={clsx(
            'p-3.5 rounded-xl border flex flex-col justify-between transition-all',
            isOwnerOrAdmin || currentStatus === 'AWAITING_APPROVAL' || currentStatus === 'APPROVED' || currentStatus === 'FILED'
              ? 'bg-amber-500/5 border-amber-500/20'
              : 'bg-muted/5 border-border opacity-70'
          )}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Step 2</span>
                {(isOwnerOrAdmin || currentStatus === 'AWAITING_APPROVAL' || currentStatus === 'APPROVED' || currentStatus === 'FILED') && (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                )}
              </div>
              <span className="text-xs font-bold text-foreground block">
                {isOwnerOrAdmin ? 'Owner Review' : 'Stage for Review'}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {isOwnerOrAdmin
                  ? 'Numbers vetted directly by Owner'
                  : 'Ready for authorized sign-off'}
              </span>
            </div>
            {isOwnerOrAdmin ? (
              <span className="text-[10px] text-emerald-600 font-bold mt-2">Vetted</span>
            ) : currentStatus === 'DRAFT' ? (
              <button
                onClick={handleStageForApproval}
                disabled={actionLoading}
                className="mt-3 px-2.5 py-1 rounded-lg bg-amber-500 text-white font-bold text-[11px] hover:bg-amber-600 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Stage for Owner
              </button>
            ) : (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-2">Staged for Owner</span>
            )}
          </div>

          {/* Step 3: Approved */}
          <div className={clsx(
            'p-3.5 rounded-xl border flex flex-col justify-between transition-all',
            currentStatus === 'APPROVED' || currentStatus === 'FILED'
              ? 'bg-blue-500/5 border-blue-500/20'
              : 'bg-muted/5 border-border'
          )}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Step 3</span>
                {(currentStatus === 'APPROVED' || currentStatus === 'FILED') && (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                )}
              </div>
              <span className="text-xs font-bold text-foreground block">Owner Authorization</span>
              <span className="text-[11px] text-muted-foreground">
                {currentFiling?.approved_by ? `Approved by ${currentFiling.approved_by}` : 'Authorizes statutory filing'}
              </span>
            </div>
            {isOwnerOrAdmin && currentStatus !== 'APPROVED' && currentStatus !== 'FILED' ? (
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="mt-3 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-[11px] hover:bg-primary/90 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                Approve Return
              </button>
            ) : (
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-2">
                {currentStatus === 'APPROVED' || currentStatus === 'FILED' ? 'Authorized' : 'Pending Owner Sign-off'}
              </span>
            )}
          </div>

          {/* Step 4: Filed */}
          <div className={clsx(
            'p-3.5 rounded-xl border flex flex-col justify-between transition-all',
            currentStatus === 'FILED'
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-muted/5 border-border opacity-70'
          )}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Step 4</span>
                {currentStatus === 'FILED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              </div>
              <span className="text-xs font-bold text-foreground block">Statutory Filing</span>
              <span className="text-[11px] text-muted-foreground">
                {currentFiling?.acknowledgement_number ? `ARN: ${currentFiling.acknowledgement_number}` : 'Record official portal ARN'}
              </span>
            </div>
            {currentStatus !== 'FILED' ? (
              <button
                onClick={() => setShowManualModal(true)}
                className="mt-3 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                Record Portal ARN
              </button>
            ) : (
              <span className="text-[10px] text-emerald-600 font-bold mt-2">Complete</span>
            )}
          </div>
        </div>
      </div>

      {/* Export & Offline Portal Tools */}
      <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Offline GST Portal Export Utilities</h3>
          <p className="text-xs text-muted-foreground">
            Generate statutory return upload packages for filing directly on the official GST Portal (gst.gov.in)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onExportJson}
            className="p-4 rounded-xl border border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10 text-left transition-all flex items-start gap-3 cursor-pointer group"
          >
            <div className="p-2.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 group-hover:scale-105 transition-transform">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-foreground block">Export Official Portal JSON</span>
              <span className="text-[11px] text-muted-foreground block mt-0.5 leading-relaxed">
                Matches the GSTN offline tool schema specification. Upload directly to the Returns Dashboard on gst.gov.in.
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-left transition-all flex items-start gap-3 cursor-pointer group"
          >
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-foreground block">Export Statutory Excel Workbook</span>
              <span className="text-[11px] text-muted-foreground block mt-0.5 leading-relaxed">
                Full audit workbook containing separate sheets for B2B, B2CL, B2CS, CDNR, HSN, and Document series.
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Recorded Filings History Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Statutory Return Filing Registry</h3>
            <p className="text-[11px] text-muted-foreground">Historical ledger of statutory returns &amp; acknowledgements</p>
          </div>
          <button
            type="button"
            onClick={refreshFilings}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RefreshCw className={clsx('w-3 h-3', loadingFilings && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {localFilings.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No filings recorded yet for this store.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-border">
              <thead className="bg-muted/40 font-semibold text-muted-foreground uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">Period</th>
                  <th className="px-4 py-2.5">Return</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Filing Mode</th>
                  <th className="px-4 py-2.5">ARN / Ack Number</th>
                  <th className="px-4 py-2.5">Filing Date</th>
                  <th className="px-4 py-2.5 text-right">Taxable Turnover</th>
                  <th className="px-4 py-2.5 text-right">Tax Amount</th>
                  <th className="px-4 py-2.5">Approved By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {localFilings.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-bold text-foreground">{f.period}</td>
                    <td className="px-4 py-2.5">{formatReturnType(f.return_type)}</td>
                    <td className="px-4 py-2.5">
                      <span className={clsx(
                        'px-2.5 py-0.5 rounded-full text-[10px] font-bold border',
                        f.status === 'FILED' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
                        f.status === 'APPROVED' && 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
                        f.status === 'AWAITING_APPROVAL' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
                        f.status === 'DRAFT' && 'bg-muted text-muted-foreground border-border'
                      )}>
                        {formatFilingStatus(f.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] font-sans">{formatFilingMode(f.filing_mode)}</td>
                    <td className="px-4 py-2.5 font-bold text-foreground">{f.acknowledgement_number || '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{f.filing_date || '—'}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(f.gross_taxable_value)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(f.total_tax_amount)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-sans">{f.approved_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Record Manual Portal Filing */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs select-none animate-in fade-in duration-200">
          <div className="relative flex flex-col w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Record Official GST Portal Filing (ARN)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enter the Acknowledgement Reference Number received from gst.gov.in
              </p>
            </div>

            <form onSubmit={handleRecordManualFiling} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Acknowledgement Reference Number (ARN)
                </label>
                <input
                  type="text"
                  required
                  value={arnInput}
                  onChange={(e) => setArnInput(e.target.value.toUpperCase())}
                  placeholder="e.g. AA3205260001234"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">Filing Date</label>
                <input
                  type="date"
                  required
                  value={filingDateInput}
                  onChange={(e) => setFilingDateInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground">
                Period: <strong>{periodLabel}</strong> • Return: <strong>{returnType}</strong> • Tax Amount: <strong>{formatCurrency(taxAmount)}</strong>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Official Acknowledgement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      <FloatToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
