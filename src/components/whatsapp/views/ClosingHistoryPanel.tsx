import { History, ChevronUp, ChevronDown, Loader2, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import type { WhatsAppSettingsState } from '../hooks/useWhatsAppSettingsState';

export interface ClosingHistoryPanelProps {
  handleRetryReport: (reportId: string) => Promise<void>;
  wa: WhatsAppSettingsState;
}

/** Shop closing report delivery history accordion, with retry for failed sends. */
export function ClosingHistoryPanel({
  handleRetryReport, wa,
}: ClosingHistoryPanelProps) {
  const { closingHistory, loadingHistory, retryingId, setShowHistory, showHistory } = wa;
  return (
    <div className="p-5 rounded-2xl bg-muted/20 border border-border/80 space-y-3">
      <button
        type="button"
        onClick={() => setShowHistory(!showHistory)}
        className="w-full flex items-center justify-between text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground">Recent Report Deliveries</span>
          {closingHistory.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {closingHistory.length}
            </span>
          )}
        </div>
        {showHistory ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {showHistory && (
        <div className="space-y-2 pt-2 animate-in fade-in duration-150">
          {loadingHistory ? (
            <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading delivery logs...
            </div>
          ) : closingHistory.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-4">
              No closing reports sent yet. Trigger a test report or close daily cash settlement to record delivery logs.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-none pr-1">
              {closingHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-card border border-border/60 text-xs flex items-center justify-between gap-3"
                >
                  <div className="space-y-0.5 text-left">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={clsx(
                          'text-[9px] font-bold px-2 py-0.5 rounded-full',
                          item.status === 'SENT'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : item.status === 'FAILED'
                            ? 'bg-rose-500/10 text-rose-500'
                            : 'bg-blue-500/10 text-blue-500'
                        )}
                      >
                        {item.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {item.trigger_type}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Date: <strong className="text-foreground">{item.business_date}</strong> &bull; To:{' '}
                      <span className="font-mono">{item.recipient_phone}</span>
                    </div>
                    {item.error_message && (
                      <p className="text-[10px] text-rose-500 truncate max-w-[200px]">
                        {item.error_message}
                      </p>
                    )}
                  </div>

                  {item.status === 'FAILED' && (
                    <button
                      type="button"
                      disabled={retryingId === item.id}
                      onClick={() => handleRetryReport(item.id)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-destructive/10 text-destructive hover:bg-destructive/20 cursor-pointer shrink-0 flex items-center gap-1"
                    >
                      {retryingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      Retry
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
