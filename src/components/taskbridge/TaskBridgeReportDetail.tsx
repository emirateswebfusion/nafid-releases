import { useState, useCallback, useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../ui/Button';
import {
  DEFAULT_STAGES,
  getStatusBadge,
  type SavedTaskBridgeReport,
  type TaskBridgeStatusReport,
  type TaskBridgeTimelineStage,
} from '../../lib/taskbridge';
import { formatDateTime } from '../../utils/time/dateDisplay';

function formatDate(isoDateString?: string) {
  if (!isoDateString) return '';
  const formatted = formatDateTime(isoDateString);
  return formatted === '—' ? '' : formatted;
}

interface TaskBridgeReportDetailProps {
  selectedReport: SavedTaskBridgeReport;
  liveStatus: TaskBridgeStatusReport | null;
  isLoadingStatus: boolean;
  statusError: string | null;
  isJustSubmitted: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onSubmitAnother: () => void;
  onClose: () => void;
}

export function TaskBridgeReportDetail({
  selectedReport,
  liveStatus,
  isLoadingStatus,
  statusError,
  isJustSubmitted,
  onBack,
  onRefresh,
  onSubmitAnother,
  onClose,
}: TaskBridgeReportDetailProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyToken = useCallback(async (token: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(token);
      } else {
        const input = document.createElement('input');
        input.value = token;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  }, []);

  const timelineStages: TaskBridgeTimelineStage[] = useMemo(() => {
    if (liveStatus?.timeline && liveStatus.timeline.length > 0) {
      return liveStatus.timeline;
    }
    const currentStatus = (liveStatus?.status || selectedReport.customerStatus || 'RECEIVED').toUpperCase();
    const order = ['RECEIVED', 'TRIAGED', 'IN_PROGRESS', 'VERIFYING', 'RESOLVED', 'CLOSED'];
    const currentIndex = order.indexOf(currentStatus);

    return DEFAULT_STAGES.map((st, idx) => {
      const isResolved = currentStatus === 'RESOLVED' || currentStatus === 'CLOSED';
      return {
        ...st,
        completed: idx < currentIndex || isResolved,
        current: st.key === currentStatus,
      };
    });
  }, [liveStatus, selectedReport]);

  const currentBadge = getStatusBadge(liveStatus?.status || selectedReport.customerStatus);

  return (
    <div className="space-y-4 animate-in fade-in duration-150 text-left">
      {/* Back to My Reports header */}
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to My Reports</span>
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoadingStatus}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer disabled:opacity-50"
          title="Refresh live status"
        >
          <RefreshCw className={`w-3 h-3 ${isLoadingStatus ? 'animate-spin' : ''}`} />
          <span>{isLoadingStatus ? 'Refreshing...' : 'Refresh Status'}</span>
        </button>
      </div>

      {/* Just submitted celebratory alert */}
      {isJustSubmitted && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>Report submitted successfully! Live progress is tracked below.</span>
        </div>
      )}

      {/* Status Header */}
      <div className="p-3.5 bg-muted/30 border border-border/80 rounded-2xl space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-extrabold text-foreground px-2 py-0.5 rounded bg-background border border-border">
              {selectedReport.ticketCode}
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${currentBadge.color}`}>
              {currentBadge.label}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {formatDate(liveStatus?.createdAt || selectedReport.createdAt)}
          </span>
        </div>

        <h3 className="text-sm font-bold text-foreground leading-snug">
          {liveStatus?.title || selectedReport.title}
        </h3>

        {liveStatus?.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {liveStatus.description}
          </p>
        )}
      </div>

      {/* Status Error if any */}
      {statusError && (
        <div className="p-2.5 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{statusError}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="font-bold underline text-[11px] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Live Status Timeline Stepper */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Live Progress Stepper
          </span>
          {isLoadingStatus && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-semibold">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span>Updating...</span>
            </span>
          )}
        </div>

        <div className="p-4 bg-card border border-border/80 rounded-2xl space-y-0">
          {timelineStages.map((stage, idx) => {
            const isLast = idx === timelineStages.length - 1;
            return (
              <div key={stage.key} className="flex items-start gap-3 relative pb-4 last:pb-0">
                {/* Connecting line */}
                {!isLast && (
                  <div
                    className={`absolute left-3.5 top-7 bottom-0 w-0.5 ${
                      stage.completed ? 'bg-emerald-500' : 'bg-border'
                    }`}
                  />
                )}

                {/* Icon circle */}
                <div className="relative z-10 shrink-0">
                  {stage.completed ? (
                    <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>
                  ) : stage.current ? (
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center ring-4 ring-primary/20 shadow-xs animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full border-2 border-border bg-background text-muted-foreground flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </div>
                  )}
                </div>

                {/* Stage text */}
                <div className="flex-1 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold ${
                        stage.current
                          ? 'text-primary'
                          : stage.completed
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {stage.label}
                    </span>
                    {stage.current && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-primary/10 text-primary border border-primary/20">
                        In Progress
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    {stage.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tracking Token Info (Zero external redirects) */}
      <div className="p-3 bg-muted/40 border border-border/70 rounded-xl flex items-center justify-between text-xs gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Tracking Token
          </span>
          <span className="font-mono text-xs font-bold text-foreground truncate block select-all">
            {selectedReport.token}
          </span>
        </div>
        <button
          type="button"
          onClick={() => handleCopyToken(selectedReport.token)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-bold text-foreground cursor-pointer shrink-0 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Token</span>
            </>
          )}
        </button>
      </div>

      {/* Bottom buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
        <Button
          type="button"
          variant="outline"
          onClick={onSubmitAnother}
          className="text-xs"
        >
          Submit Another Report
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          className="text-xs"
        >
          Close
        </Button>
      </div>
    </div>
  );
}
