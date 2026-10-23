import React from 'react';
import { lookupReturnCredit, lookupScrapCredit } from '../deductionLookup';
import { ArrowLeftRight } from 'lucide-react';
import { formatCurrency } from '../BillingConstants';
import { parseUTCDate } from '../../../utils/receiptGenerator';
import { getStoreTimezone } from '../../../utils/timezoneHelper';

/** A pending return invoice offered as a deduction (fields the dropdown reads). */
export interface ReturnDeductionResult {
  return_number: string;
  customer_name?: string | null;
  grand_total: number;
  adjusted_amount?: number | null;
}

/** A pending scrap invoice offered as a deduction (fields the dropdown reads). */
export interface ScrapDeductionResult {
  invoice_number: string;
  created_at: string;
  total_amount: number;
  total_qty?: number | string | null;
}

export interface DeductionDropdownsProps {
  returnDeductionDropdownStyle: React.CSSProperties | null;
  returnDeductionResults: ReturnDeductionResult[];
  scrapDeductionDropdownStyle: React.CSSProperties | null;
  scrapDeductionResults: ScrapDeductionResult[];
  setHardwareError: React.Dispatch<React.SetStateAction<string | null>>;
  setReturnDeduction: (amount: number, returnInvoiceNumber: string) => void;
  setReturnDeductionDropdownStyle: React.Dispatch<React.SetStateAction<React.CSSProperties | null>>;
  setReturnDeductionResults: React.Dispatch<React.SetStateAction<ReturnDeductionResult[]>>;
  setReturnDeductionSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setScrapDeduction: (amount: number, invoiceNumber: string) => void;
  setScrapDeductionDropdownStyle: React.Dispatch<React.SetStateAction<React.CSSProperties | null>>;
  setScrapDeductionResults: React.Dispatch<React.SetStateAction<ScrapDeductionResult[]>>;
  setScrapDeductionSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  tenantId: string | null;
}

/**
 * Search results for the return and scrap deduction inputs, rendered fixed-position outside the overflow containers;
 * picking a result looks up its credit and applies it as the deduction.
 */
export function DeductionDropdowns({
  returnDeductionDropdownStyle, returnDeductionResults, scrapDeductionDropdownStyle, scrapDeductionResults,
  setHardwareError, setReturnDeduction, setReturnDeductionDropdownStyle, setReturnDeductionResults,
  setReturnDeductionSearchQuery, setScrapDeduction, setScrapDeductionDropdownStyle, setScrapDeductionResults,
  setScrapDeductionSearchQuery, tenantId,
}: DeductionDropdownsProps) {
  return (
    <>
    {returnDeductionResults.length > 0 && returnDeductionDropdownStyle && (
      <div id="return-deduction-dropdown" style={returnDeductionDropdownStyle} className="bg-card border border-border rounded-xl shadow-xl animate-in fade-in slide-in-from-top-1 duration-200">
        <div className="max-h-[260px] overflow-y-auto">
          <div className="px-3 py-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border">
            Returns with Pending Balance
          </div>
          {returnDeductionResults.map((r, _i) => (
            <button
              key={r.return_number}
              onClick={async () => {
                try {
                  const credit = await lookupReturnCredit(tenantId || '', r.return_number);
                  if (credit.status === 'found') {
                    setReturnDeduction(credit.amount, credit.number);
                    setReturnDeductionSearchQuery('');
                    setReturnDeductionResults([]);
                    setReturnDeductionDropdownStyle(null);
                  } else if (credit.status === 'error') {
                    setHardwareError(credit.message);
                  }
                } catch {
                  setHardwareError('Failed to fetch return');
                }
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-rose-500/5 border-b border-border last:border-0 transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{r.return_number}</p>
                <p className="text-[10px] text-muted-foreground truncate">{r.customer_name || 'N/A'}</p>
              </div>
              <span className="text-xs font-black text-rose-600 shrink-0">{formatCurrency(r.grand_total - (r.adjusted_amount || 0))}</span>
            </button>
          ))}
        </div>
      </div>
    )}

    {/* ─── Scrap Deduction Dropdown (fixed position, outside overflow containers) ─── */}
    {scrapDeductionResults.length > 0 && scrapDeductionDropdownStyle && (
      <div id="scrap-deduction-dropdown" style={scrapDeductionDropdownStyle} className="bg-card border border-border rounded-xl shadow-xl animate-in fade-in slide-in-from-top-1 duration-200">
        <div className="max-h-[260px] overflow-y-auto">
          <div className="px-3 py-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-wider border-b border-border">
            Pending Scrap Invoices
          </div>
          {scrapDeductionResults.map((inv, _i) => (
            <button
              key={inv.invoice_number}
              onClick={async () => {
                try {
                  const credit = await lookupScrapCredit(tenantId || '', inv.invoice_number);
                  if (credit.status === 'found') {
                    setScrapDeduction(credit.amount, credit.number);
                    setScrapDeductionSearchQuery('');
                    setScrapDeductionResults([]);
                    setScrapDeductionDropdownStyle(null);
                  } else {
                    setHardwareError(credit.status === 'error' ? credit.message : 'Scrap invoice not found');
                  }
                } catch {
                  setHardwareError('Failed to fetch scrap invoice');
                }
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-500/5 border-b border-border last:border-0 transition-colors cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-foreground truncate">{inv.invoice_number}</div>
                <div className="text-[10px] text-muted-foreground">
                  <span className="text-amber-500 font-semibold">Pending</span> · {Number(inv.total_qty || 0).toFixed(1)} qty · {parseUTCDate(inv.created_at).toLocaleDateString('en-IN', { timeZone: getStoreTimezone() })}
                </div>
              </div>
              <div className="text-xs font-black text-orange-600">{formatCurrency(inv.total_amount)}</div>
            </button>
          ))}
        </div>
      </div>
    )}
    </>
  );
}
