import { localizeTaxText } from '../../../utils/localization/storeProfile';
import { getSalesTaxBreakdown } from '../../../utils/pricing/salesHistoryAmount';
import { formatCurrency } from '../../../utils/pricing/money';

interface SalesTaxSummaryProps {
  totalIncludingGst: number;
  gstAmount: number;
  isHidden: boolean;
  isMasked: boolean;
  loading?: boolean;
}

/** The sales value is after invoice discounts and before scrap / return credits. */
export function SalesTaxSummary({ totalIncludingGst, gstAmount, isHidden, isMasked, loading = false }: SalesTaxSummaryProps) {
  const totals = getSalesTaxBreakdown({ totalSalesBeforeDeductions: totalIncludingGst, totalTax: gstAmount });
  const figures = [
    { label: 'Sales excluding GST', amount: totals.salesExcludingGst, protected: isMasked },
    { label: 'GST Amount', amount: totals.gstAmount, protected: isMasked },
    { label: 'Grand Total including GST', amount: totals.grandTotalIncludingGst, protected: false },
  ];
  return <>
    {figures.map(figure => (
      <div key={figure.label} className="px-3 py-2 rounded-xl bg-background border border-border/60 min-w-[155px]"
        title="After invoice discounts; before scrap / return credits">
        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">{localizeTaxText(figure.label)}</span>
        <span className="text-xs font-black font-mono tabular-nums text-teal-600 dark:text-teal-400 block mt-0.5">
          {loading ? '…' : isHidden ? '••••••••' : figure.protected ? 'Protected' : formatCurrency(figure.amount)}
        </span>
      </div>
    ))}
  </>;
}
