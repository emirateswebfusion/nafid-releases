import { getStoreBusinessDate } from '../../../utils/time/timezoneHelper';
import { useState } from 'react';
import {
  ExternalLink, Copy, Check, FileText, CheckCircle2,
  Clock, ShieldCheck, HelpCircle, Send, ArrowRight
} from 'lucide-react';
import clsx from 'clsx';
import type { Vat201Report } from '../../../../electron/services/vatReportService';
import type { LocalVatFilingRow } from '../../../../electron/services/vatFilingService';

interface VatFilingGuideTabProps {
  report: Vat201Report;
  filings: LocalVatFilingRow[];
  loadingFilings: boolean;
  currentPeriodKey: string;
  currentFiling?: LocalVatFilingRow;
  onApproveFiling: (notes?: string) => Promise<boolean>;
  onRecordEmaraTaxAck: (payload: { acknowledgementNumber: string; filingDate: string; notes?: string }) => Promise<boolean>;
}

function formatFilingStatus(status: string): string {
  switch (status) {
    case 'FILED':
      return 'Filed';
    case 'APPROVED':
      return 'Approved';
    case 'DRAFT':
    default:
      return 'Draft';
  }
}

function formatFilingMode(mode: string): string {
  switch (mode) {
    case 'EMARATAX_PORTAL':
      return 'EmaraTax Portal';
    case 'OFFLINE_FAF':
      return 'Offline FAF';
    case 'OFFLINE_EXCEL':
      return 'Offline Excel';
    default:
      return mode ? mode.replace(/_/g, ' ') : '—';
  }
}

export function VatFilingGuideTab({
  report,
  filings,
  loadingFilings,
  currentPeriodKey,
  currentFiling,
  onApproveFiling,
  onRecordEmaraTaxAck,
}: VatFilingGuideTabProps) {
  const [subTab, setSubTab] = useState<'guide' | 'history'>('guide');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Approval modal state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');
  const [isApproving, setIsApproving] = useState(false);

  // Manual Ack modal state
  const [showAckModal, setShowAckModal] = useState(false);
  const [ackNumber, setAckNumber] = useState('');
  const [ackDate, setAckDate] = useState(() => getStoreBusinessDate());
  const [ackNotes, setAckNotes] = useState('');
  const [isSubmittingAck, setIsSubmittingAck] = useState(false);

  const copyToClipboard = (text: string | number, key: string) => {
    const val = typeof text === 'number' ? text.toFixed(2) : String(text);
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(prev => (prev === key ? null : prev));
    }, 2000);
  };

  const formatAed = (num: number) => {
    return `AED ${num.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleConfirmApproval = async () => {
    setIsApproving(true);
    const success = await onApproveFiling(approveNotes);
    setIsApproving(false);
    if (success) {
      setShowApproveModal(false);
      setApproveNotes('');
    }
  };

  const handleConfirmAck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ackNumber.trim()) return;
    setIsSubmittingAck(true);
    const success = await onRecordEmaraTaxAck({
      acknowledgementNumber: ackNumber.trim(),
      filingDate: ackDate,
      notes: ackNotes.trim() || undefined,
    });
    setIsSubmittingAck(false);
    if (success) {
      setShowAckModal(false);
      setAckNumber('');
      setAckNotes('');
    }
  };

  const s1 = report.section1Output;
  const s2 = report.section2Input;
  const net = report.netDue;

  const emiratesList = [
    { key: 'abuDhabi', box: 'Box 1a', name: 'Abu Dhabi', data: s1.standardRatedSupplies.abuDhabi },
    { key: 'dubai', box: 'Box 1b', name: 'Dubai', data: s1.standardRatedSupplies.dubai },
    { key: 'sharjah', box: 'Box 1c', name: 'Sharjah', data: s1.standardRatedSupplies.sharjah },
    { key: 'ajman', box: 'Box 1d', name: 'Ajman', data: s1.standardRatedSupplies.ajman },
    { key: 'ummAlQuwain', box: 'Box 1e', name: 'Umm Al Quwain', data: s1.standardRatedSupplies.ummAlQuwain },
    { key: 'rasAlKhaimah', box: 'Box 1f', name: 'Ras Al Khaimah', data: s1.standardRatedSupplies.rasAlKhaimah },
    { key: 'fujairah', box: 'Box 1g', name: 'Fujairah', data: s1.standardRatedSupplies.fujairah },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Top Period & Status Control Card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                VAT Period Filing Status
              </span>
              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-xs font-black">
                {currentPeriodKey}
              </span>
              {currentFiling?.status === 'FILED' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Filed on EmaraTax
                </span>
              ) : currentFiling?.status === 'APPROVED' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <ShieldCheck className="w-3.5 h-3.5" /> Approved — Ready to File
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Clock className="w-3.5 h-3.5" /> Draft Status
                </span>
              )}
            </div>
            <div className="text-xl font-black text-foreground flex items-center gap-3">
              <span>{formatAed(net.netVatPayable)}</span>
              <span className={clsx(
                'text-xs font-bold px-2 py-0.5 rounded-md',
                net.status === 'PAYABLE' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                net.status === 'RECLAIMABLE' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                net.status === 'NIL' && 'bg-muted text-muted-foreground'
              )}>
                {net.status === 'PAYABLE' ? 'Net VAT Payable to FTA' : net.status === 'RECLAIMABLE' ? 'Net VAT Reclaimable' : 'NIL Return'}
              </span>
            </div>
            {currentFiling?.acknowledgement_number && (
              <p className="text-xs text-muted-foreground font-medium pt-1">
                FTA Ack: <span className="font-mono font-bold text-foreground">{currentFiling.acknowledgement_number}</span>
                {currentFiling.filing_date && ` • Filed Date: ${currentFiling.filing_date}`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentFiling?.status !== 'FILED' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowApproveModal(true)}
                  className="px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted text-foreground font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>{currentFiling?.status === 'APPROVED' ? 'Update Approval' : 'Approve Return'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAckModal(true)}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Record EmaraTax Ack</span>
                </button>
              </>
            )}

            <a
              href="https://eservices.tax.gov.ae"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <span>Open EmaraTax</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Sub-tab selection */}
        <div className="flex items-center gap-3 pt-4">
          <button
            type="button"
            onClick={() => setSubTab('guide')}
            className={clsx(
              'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
              subTab === 'guide'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <HelpCircle className="w-3.5 h-3.5 text-teal-600" />
            <span>How to File on EmaraTax (Box-by-Box Guide &amp; Copy)</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('history')}
            className={clsx(
              'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
              subTab === 'history'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span>Filing History &amp; Acknowledgements ({filings.length})</span>
          </button>
        </div>
      </div>

      {/* 2. SUBTAB CONTENT */}
      {subTab === 'guide' ? (
        <div className="space-y-6">
          {/* Step 1 & Overview Alert */}
          <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-5 flex items-start gap-3">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-400 shrink-0">
              <Send className="w-4 h-4" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="font-bold text-foreground">Step 1: Sign in to EmaraTax &amp; Initiate Return</div>
              <p className="text-muted-foreground leading-relaxed">
                Log into the UAE Federal Tax Authority portal (<strong>https://eservices.tax.gov.ae</strong>) using UAE PASS or your FTA tax credentials.
                Under your registered Taxable Person account, navigate to <strong>VAT &gt; VAT Returns &gt; Form VAT 201</strong>, and choose period <strong className="font-mono">{currentPeriodKey}</strong>.
              </p>
            </div>
          </div>

          {/* Step 2: One-Click Copy Helper for Box 1a-1g */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Step 2: Section 1 Output Tax (Boxes 1a to 1g)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click <strong>Copy</strong> next to each number and paste directly into the corresponding box in the EmaraTax portal.
                </p>
              </div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Standard Rate: 5%
              </span>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                    <th className="py-2.5 px-4 text-left">Box #</th>
                    <th className="py-2.5 px-4 text-left">Emirate</th>
                    <th className="py-2.5 px-4 text-right">Taxable Amount (AED)</th>
                    <th className="py-2.5 px-4 text-right">Adjustments (AED)</th>
                    <th className="py-2.5 px-4 text-right">VAT Due (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  {emiratesList.map(item => (
                    <tr key={item.key} className="hover:bg-muted/20">
                      <td className="py-2.5 px-4 font-bold text-foreground font-sans">{item.box}</td>
                      <td className="py-2.5 px-4 font-semibold text-foreground font-sans">{item.name}</td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>{item.data.amount.toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.data.amount, `${item.key}-amount`)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Copy taxable amount"
                          >
                            {copiedKey === `${item.key}-amount` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>{item.data.adjustment.toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.data.adjustment, `${item.key}-adj`)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Copy adjustment amount"
                          >
                            {copiedKey === `${item.key}-adj` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-foreground">
                        {item.data.vatAmount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {/* Box 4 & Box 5 */}
                  <tr className="bg-muted/10">
                    <td className="py-2.5 px-4 font-bold text-foreground font-sans">Box 4</td>
                    <td className="py-2.5 px-4 font-semibold text-foreground font-sans">Zero-rated supplies (Exports)</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{s1.zeroRatedSupplies.amount.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(s1.zeroRatedSupplies.amount, 'box4-amount')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {copiedKey === 'box4-amount' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">—</td>
                    <td className="py-2.5 px-4 text-right font-bold text-foreground">0.00</td>
                  </tr>
                  <tr className="bg-muted/10">
                    <td className="py-2.5 px-4 font-bold text-foreground font-sans">Box 5</td>
                    <td className="py-2.5 px-4 font-semibold text-foreground font-sans">Exempt supplies</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{s1.exemptSupplies.amount.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(s1.exemptSupplies.amount, 'box5-amount')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {copiedKey === 'box5-amount' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right text-muted-foreground">—</td>
                    <td className="py-2.5 px-4 text-right font-bold text-foreground">0.00</td>
                  </tr>
                  {/* Box 8 Total */}
                  <tr className="bg-muted/30 font-bold">
                    <td className="py-3 px-4 text-foreground font-sans">Box 8</td>
                    <td className="py-3 px-4 text-foreground font-sans">Total Output Tax</td>
                    <td className="py-3 px-4 text-right">{s1.totalOutputTax.totalAmount.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">{s1.totalOutputTax.totalAdjustment.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-primary">{s1.totalOutputTax.netOutputVatDue.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Step 3: Input Tax (Boxes 9 to 11) */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">Step 3: Section 2 Recoverable Input Tax (Box 9 &amp; 11)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Input tax is recoverable only for standard business expenses with valid Tax Invoices mentioning your shop&apos;s TRN.
              </p>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                    <th className="py-2.5 px-4 text-left">Box #</th>
                    <th className="py-2.5 px-4 text-left">Description</th>
                    <th className="py-2.5 px-4 text-right">Gross Purchases (AED)</th>
                    <th className="py-2.5 px-4 text-right">Recoverable VAT (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-foreground font-sans">Box 9</td>
                    <td className="py-2.5 px-4 font-semibold text-foreground font-sans">Standard rated expenses (5%)</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{s2.standardRatedExpenses.amount.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(s2.standardRatedExpenses.amount, 'box9-amount')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {copiedKey === 'box9-amount' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-foreground">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{s2.standardRatedExpenses.vatAmount.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(s2.standardRatedExpenses.vatAmount, 'box9-vat')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {copiedKey === 'box9-vat' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr className="bg-muted/30 font-bold">
                    <td className="py-3 px-4 text-foreground font-sans">Box 11</td>
                    <td className="py-3 px-4 text-foreground font-sans">Total Recoverable Tax</td>
                    <td className="py-3 px-4 text-right">{s2.totalInputTax.totalAmount.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">
                      {s2.totalInputTax.netInputVatRecoverable.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="text-[11px] text-muted-foreground p-3 rounded-xl bg-muted/40 leading-relaxed">
              <strong>Non-Recoverable Input VAT reminder (FTA Law):</strong> Input tax cannot be claimed for entertainment services provided to non-employees or customers, or motor vehicles used for personal purposes. Ensure all supplier invoices have supplier TRN.
            </div>
          </div>

          {/* Step 4 & 5: Settlement & Record Keeping */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <ArrowRight className="w-4 h-4" />
                </span>
                <span>Step 4: Box 14 Net VAT Settlement</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                If Net VAT Due is <strong>Payable</strong>, payment must be completed by the <strong>28th day</strong> of the month following the end of the tax period.
                Pay directly on EmaraTax via credit/debit card, e-Dirham, or transfer funds to your entity&apos;s unique FTA <strong>GIBAN</strong> bank account number.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-600">
                  <FileText className="w-4 h-4" />
                </span>
                <span>Step 5: Record Keeping (5 Years Minimum)</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Federal Decree-Law No. 7 on Tax Procedures mandates that all Tax Invoices, Credit Notes, and accounting books be retained for a minimum of <strong>5 years</strong>.
                Export and archive the official <strong>FTA Audit File (FAF)</strong> after each filing.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* History view */
        <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-foreground">Local Form VAT 201 Filings</h3>
              <p className="text-[11px] text-muted-foreground">Historical records stored locally in your POS database</p>
            </div>
            {loadingFilings && <span className="text-xs text-muted-foreground">Refreshing...</span>}
          </div>

          {filings.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted-foreground">
              No local VAT filings recorded yet. Click &quot;Approve Return&quot; or &quot;Record EmaraTax Ack&quot; above to begin tracking.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                    <th className="py-2.5 px-4 text-left">Period</th>
                    <th className="py-2.5 px-4 text-left">Status</th>
                    <th className="py-2.5 px-4 text-left">Mode</th>
                    <th className="py-2.5 px-4 text-right">Net Output VAT</th>
                    <th className="py-2.5 px-4 text-right">Recoverable Input</th>
                    <th className="py-2.5 px-4 text-right">Net Due / Refund</th>
                    <th className="py-2.5 px-4 text-left">FTA Ack #</th>
                    <th className="py-2.5 px-4 text-left">Filed Date</th>
                    <th className="py-2.5 px-4 text-left">Approved By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filings.map(f => (
                    <tr key={f.id} className="hover:bg-muted/20">
                      <td className="py-2.5 px-4 font-mono font-bold text-foreground">{f.period}</td>
                      <td className="py-2.5 px-4">
                        <span className={clsx(
                          'px-2.5 py-0.5 rounded-full text-[10px] font-bold border',
                          f.status === 'FILED' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                          f.status === 'APPROVED' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
                          f.status === 'DRAFT' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        )}>
                          {formatFilingStatus(f.status)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground font-semibold text-[11px] font-sans">{formatFilingMode(f.filing_mode)}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{formatAed(f.net_output_vat)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                        {formatAed(f.recoverable_input_vat)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-foreground">
                        {formatAed(f.net_vat_payable)}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-muted-foreground">
                        {f.acknowledgement_number || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {f.filing_date || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {f.approved_by || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. APPROVAL MODAL */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-foreground">Approve VAT Return ({currentPeriodKey})</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Mark this return as verified and approved by the accountant or store manager prior to filing on the FTA EmaraTax portal.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Audit / Approval Notes (Optional)</label>
              <textarea
                value={approveNotes}
                onChange={e => setApproveNotes(e.target.value)}
                placeholder="e.g. Reconciled with bank statements and verified credit notes"
                rows={3}
                className="w-full p-2.5 text-xs rounded-xl bg-background border border-border text-foreground shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApproval}
                disabled={isApproving}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isApproving ? 'Approving...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. RECORD MANUAL ACK MODAL */}
      {showAckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleConfirmAck}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-foreground">Record EmaraTax Acknowledgement</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter the official submission reference or acknowledgement number generated upon successful submission in the EmaraTax portal.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">FTA Acknowledgement Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FTA-2026-VAT201-098231"
                  value={ackNumber}
                  onChange={e => setAckNumber(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-background border border-border text-foreground font-mono shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Filing Date *</label>
                <input
                  type="date"
                  required
                  value={ackDate}
                  onChange={e => setAckDate(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-background border border-border text-foreground shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Paid via FTA GIBAN transfer on 28th"
                  value={ackNotes}
                  onChange={e => setAckNotes(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl bg-background border border-border text-foreground shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAckModal(false)}
                className="px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingAck || !ackNumber.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingAck ? 'Recording...' : 'Save Acknowledgement'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
