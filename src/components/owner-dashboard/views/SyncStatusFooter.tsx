import { syncNeedsAttention } from '../../../utils/sync/syncOutcome';
import { DigitalClock } from '../DigitalClock';
import type { OwnerDashboardProps } from '../ownerDashboardTypes';
type Props = OwnerDashboardProps & { displayTime: string; isLastSyncRecent: boolean };

/** Customer summary never exposes support diagnostics or calls a partial cycle complete. */
export function SyncStatusFooter({ isSyncing, syncProgress, syncComplete, shuffledQuotes, quoteIndex, QUOTES, displayTime, isLastSyncRecent }: Props) {
  return <>{(isSyncing || syncComplete) && syncProgress && !syncNeedsAttention(syncProgress.label) ? (
                <div className="px-6 py-2.5 border-t border-border bg-card relative z-0">
                    <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-xs font-medium text-foreground/80 shrink-0">
                            {syncComplete ? 'Sync Complete' : 'Syncing...'}
                        </span>
                        <div className="flex-1 bg-primary/10 rounded-full h-2 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ease-out ${syncComplete ? 'bg-emerald-500' : 'bg-primary'}`}
                                style={{ width: `${syncComplete ? 100 : syncProgress.percent}%` }}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {syncComplete ? '100%' : `${syncProgress.percent}%`}
                        </span>
                    </div>
                    {!syncComplete && shuffledQuotes.length > 0 && (
                        <div className="text-center">
                            <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed">
                                &ldquo;{QUOTES[shuffledQuotes[quoteIndex]]?.text ?? QUOTES[quoteIndex].text}&rdquo;
                            </p>
                            <p className="text-[10px] text-muted-foreground/50">
                                — {QUOTES[shuffledQuotes[quoteIndex]]?.author ?? QUOTES[quoteIndex].author}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="px-8 py-3.5 border-t border-border bg-muted/30 relative z-0">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${syncNeedsAttention(syncProgress?.label) ? 'bg-muted-foreground/50' : isLastSyncRecent ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <span>Last checked: <span className="font-medium text-foreground/70">{displayTime}</span></span>
                        </div>
                        <DigitalClock variant="footer" />
                    </div>
                </div>
            )}</>;
}
