import { Printer, FileText, ArrowLeftRight, Recycle } from 'lucide-react';
import type { BillingUIConfig } from '../../../store/billingUIStore';

export interface PostPrintModeSectionProps {
  config: BillingUIConfig;
  handleUpdate: (partial: Partial<BillingUIConfig>) => void;
}

/** Billing page controls: what the billing screen keeps or resets after a bill is printed. */
export function PostPrintModeSection({
  config, handleUpdate,
}: PostPrintModeSectionProps) {
  return (
    <div className="space-y-3 col-span-1 md:col-span-3 pt-4 border-t border-border/60">
      <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
        <Printer className="w-4 h-4 text-blue-500" />
        <span>Post-Print Mode Persistence (Stay in Mode after Save / Print)</span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 1. Stay in Quotation Mode */}
        <label className="flex items-start gap-3 p-3.5 bg-background border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            checked={config.stayInQuotationModeAfterPrint ?? false}
            onChange={(e) => handleUpdate({ stayInQuotationModeAfterPrint: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
          />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span>Stay in Quotation Mode</span>
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              After saving or printing a quotation, stay in Quotation Mode (F6) and reserve the next quote number automatically.
            </span>
          </div>
        </label>

        {/* 2. Stay in Return Mode */}
        <label className="flex items-start gap-3 p-3.5 bg-background border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            checked={config.stayInReturnModeAfterPrint ?? false}
            onChange={(e) => handleUpdate({ stayInReturnModeAfterPrint: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer shrink-0"
          />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <ArrowLeftRight className="w-3.5 h-3.5 text-rose-500" />
              <span>Stay in Return Mode</span>
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              After processing or printing a sales return, stay in Return Mode (F7) for consecutive returns.
            </span>
          </div>
        </label>

        {/* 3. Stay in Scrap Mode */}
        <label className="flex items-start gap-3 p-3.5 bg-background border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            checked={config.stayInScrapModeAfterPrint ?? false}
            onChange={(e) => handleUpdate({ stayInScrapModeAfterPrint: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded text-orange-600 focus:ring-orange-500 cursor-pointer shrink-0"
          />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Recycle className="w-3.5 h-3.5 text-orange-500" />
              <span>Stay in Scrap Mode</span>
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              After completing or printing a scrap purchase, stay in Scrap Mode (F5) for consecutive scrap transactions.
            </span>
          </div>
        </label>
      </div>
    </div>
  );
}
