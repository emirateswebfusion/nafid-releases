import { Plus, X } from 'lucide-react';
import { useTabStore } from '../store/tabStore';
import clsx from 'clsx';

export function BillingTabBar({ onAddTab, enableThreeInvoiceSeries }: { onAddTab?: () => void; enableThreeInvoiceSeries?: boolean }) {
  const tabs = useTabStore(s => s.tabs);
  const activeTabId = useTabStore(s => s.activeTabId);
  const switchTab = useTabStore(s => s.switchTab);
  const closeTab = useTabStore(s => s.closeTab);

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    closeTab(id);
  };

  const handleAdd = () => {
    if (onAddTab) {
      onAddTab();
    }
  };

  const formatTabTitle = (tab: typeof tabs[0]) => {
    const isReturn = tab.snapshot?.isReturnMode;
    const isScrap = tab.snapshot?.isScrapMode;
    const isQuotation = tab.snapshot?.isQuotationMode;
    const editingNumber = tab.snapshot?.editingInvoiceNumber || tab.snapshot?.editingQuotationNumber;
    const isGst = tab.snapshot?.invoiceType === 'GST';

    let displayNum = '';
    if (isReturn) {
      displayNum = tab.reservedReturnNumber || tab.title;
    } else if (isScrap) {
      displayNum = tab.reservedScrapInvoiceNumber || tab.title;
    } else if (isQuotation) {
      displayNum = tab.reservedQuotationNumber || tab.title;
    } else if (editingNumber) {
      displayNum = editingNumber;
    } else {
      displayNum = tab.reservedInvoiceNumber || tab.title;
    }

    if (!displayNum) return 'New Bill';
    if (enableThreeInvoiceSeries) {
      return displayNum;
    }
    const isModeNumber = displayNum === tab.reservedScrapInvoiceNumber || displayNum === tab.reservedQuotationNumber || displayNum === tab.reservedReturnNumber;
    if (isGst && !displayNum.startsWith('GST-') && !isModeNumber) {
      return `GST-${displayNum}`;
    }
    return displayNum;
  };

  return (
    <div className="flex items-end bg-muted/30 border-b border-border overflow-x-auto shrink-0">
      <div className="flex items-end gap-0 px-1">
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border border-border cursor-pointer select-none whitespace-nowrap transition-colors -mb-px',
              tab.id === activeTabId
                ? 'bg-background text-foreground border-b-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <span className="truncate max-w-[120px]">{formatTabTitle(tab)}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => handleClose(e, tab.id)}
                className="p-0.5 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={handleAdd}
          className="flex items-center justify-center p-2 ml-0.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title="New Bill"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
