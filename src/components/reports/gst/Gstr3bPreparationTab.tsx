import { Landmark, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import type { Gstr1Report } from '../../../../electron/services/gstReportService';
import { formatCurrency } from '../../../utils/pricing/money';

interface Gstr3bPreparationTabProps {
  report: Gstr1Report | null;
  shopName: string;
  shopGstin: string;
  onNavigateTab: (tab: string) => void;
}

export function Gstr3bPreparationTab({
  report,
  shopGstin,
  onNavigateTab,
}: Gstr3bPreparationTabProps) {
  const summary = report?.summary;
  const taxableTurnover = summary?.total_taxable_value ?? 0;
  const totalCgst = summary?.total_cgst ?? 0;
  const totalSgst = summary?.total_sgst ?? 0;
  const totalIgst = summary?.total_igst ?? 0;
  const totalTax = summary?.total_tax ?? 0;

  // Inter-state supplies to unregistered (from b2cl and b2cs inter-state)
  const interStateSupplies = (report?.b2cl || []).reduce((acc, row) => {
    return acc + (row.taxable_value || 0);
  }, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Statutory Guidance Banner */}
      <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 text-xs flex items-start gap-3">
        <Landmark className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-sm">GSTR-3B Statutory Return Preparation Summary</p>
          <p className="leading-relaxed text-muted-foreground">
            Under Section 39 of the CGST Act, GSTR-3B is a monthly/quarterly self-declaration summary of outward supplies, input tax credits, and net tax liability for GSTIN:{' '}
            <strong className="text-foreground font-mono">{shopGstin || 'Not Configured'}</strong>. Outward supply figures below are computed from verified sales and credit notes.
          </p>
        </div>
      </div>

      {/* Table 3.1: Outward Supplies */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              3.1 Details of Outward Supplies &amp; Inward Supplies Liable to Reverse Charge
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Self-assessed tax liability on sales &amp; outward turnover
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
            Statutory Table 3.1
          </span>
        </div>

        <div className="divide-y divide-border text-xs">
          {/* 3.1.a */}
          <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-muted/10">
            <div className="max-w-md">
              <span className="font-bold text-foreground block">
                (a) Outward taxable supplies (other than zero rated, nil rated and exempted)
              </span>
              <span className="text-[11px] text-muted-foreground">
                Standard B2B, B2C intra-state and inter-state transactions net of credit notes
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-right">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Total Taxable</span>
                <span className="font-mono font-bold text-foreground">{formatCurrency(taxableTurnover)}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">IGST</span>
                <span className="font-mono font-bold text-foreground">{formatCurrency(totalIgst)}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">CGST</span>
                <span className="font-mono font-bold text-foreground">{formatCurrency(totalCgst)}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">SGST / UTGST</span>
                <span className="font-mono font-bold text-foreground">{formatCurrency(totalSgst)}</span>
              </div>
            </div>
          </div>

          {/* 3.1.b */}
          <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="max-w-md">
              <span className="font-bold text-foreground block">
                (b) Outward taxable supplies (zero-rated / exports / SEZ)
              </span>
              <span className="text-[11px] text-muted-foreground">Supplies to SEZ units or overseas exports</span>
            </div>
            <div className="text-right">
              <span className="font-mono text-muted-foreground">₹0.00</span>
            </div>
          </div>

          {/* 3.1.c */}
          <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="max-w-md">
              <span className="font-bold text-foreground block">
                (c) Other outward supplies (Nil rated, exempted)
              </span>
              <span className="text-[11px] text-muted-foreground">Non-taxable statutory sales</span>
            </div>
            <div className="text-right">
              <span className="font-mono text-muted-foreground">₹0.00</span>
            </div>
          </div>

          {/* 3.1.d */}
          <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="max-w-md">
              <span className="font-bold text-foreground block">
                (d) Inward supplies liable to reverse charge (RCM)
              </span>
              <span className="text-[11px] text-muted-foreground">Purchases where tax liability falls on the recipient</span>
            </div>
            <div className="text-right">
              <span className="font-mono text-muted-foreground">₹0.00</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table 3.2: Inter-state supplies to unregistered persons */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              3.2 Inter-State Supplies Made to Unregistered Persons
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Of the supplies shown in 3.1(a), inter-state retail supplies breakdown
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
            Statutory Table 3.2
          </span>
        </div>

        <div className="p-4 flex items-center justify-between bg-muted/10 text-xs">
          <div>
            <span className="font-bold text-foreground block">Inter-State Consumer (B2C) Taxable Supplies</span>
            <span className="text-[11px] text-muted-foreground">Supplies originating across state borders</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Total Taxable Value</span>
            <span className="font-mono font-bold text-foreground">{formatCurrency(interStateSupplies)}</span>
          </div>
        </div>
      </div>

      {/* Table 4: Eligible Input Tax Credit (ITC) */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              4. Eligible Input Tax Credit (ITC)
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Statutory credit from inward supplies &amp; purchases
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
            Reconciliation Advisory
          </span>
        </div>

        <div className="p-4 space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Mandatory Inward Purchase Reconciliation:</strong> Under Section 16(2)(aa) of the CGST Act, Input Tax Credit (ITC) is strictly claimable only if the supplier has filed GSTR-1 and it appears in your auto-populated <strong>GSTR-2B</strong> on the GST Portal. Verify inward purchase bills recorded in NAFID POS against your official GSTR-2B before claiming ITC.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border">
              <span className="text-[11px] text-muted-foreground block font-semibold">Available Outward Tax</span>
              <span className="text-base font-bold font-mono text-foreground">{formatCurrency(totalTax)}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border">
              <span className="text-[11px] text-muted-foreground block font-semibold">Staged ITC Inward Credit</span>
              <span className="text-base font-bold font-mono text-amber-600 dark:text-amber-400">GSTR-2B Pending</span>
            </div>
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border">
              <span className="text-[11px] text-muted-foreground block font-semibold">Estimated Net Payable</span>
              <span className="text-base font-bold font-mono text-foreground">{formatCurrency(totalTax)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation CTA to Compliance Filing */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <span className="text-xs font-bold text-foreground block">Ready to record or stage this return?</span>
            <span className="text-[11px] text-muted-foreground">
              Review filing approvals, download official JSON schemas, or record manual portal ARN
            </span>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab('filing')}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <span>Open Filing Center</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
