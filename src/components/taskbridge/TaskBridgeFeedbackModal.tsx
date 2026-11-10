import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Lightbulb,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  Users,
  Search,
  ArrowUp,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FloatToast, type ToastMessage } from '../ui/FloatToast';
import {
  submitToTaskBridge,
  getProjectCommunityBoard,
  upvoteTaskBridgeTask,
  getCachedBoard,
  getBoardWindow,
  openItemCount,
  saveBoardToCache,
  type CommunityBoardItem,
  type TaskBridgeSubmission,
} from '../../lib/taskbridge';
import { useAuthStore } from '../../store/authStore';
import { getStatusBadge } from '../../lib/taskbridge';

export interface TaskBridgeFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: 'BUG' | 'FEATURE';
  initialDescription?: string;
  defaultTab?: 'NEW' | 'BOARD';
}

interface InnerProps {
  onClose: () => void;
  defaultType?: 'BUG' | 'FEATURE';
  initialDescription?: string;
  defaultTab?: 'NEW' | 'BOARD';
}

function TaskBridgeFeedbackModalInner({
  onClose,
  defaultType = 'BUG',
  initialDescription = '',
  defaultTab = 'NEW',
}: InnerProps) {
  const [activeTab, setActiveTab] = useState<'NEW' | 'BOARD'>(defaultTab);
  const [type, setType] = useState<'BUG' | 'FEATURE'>(defaultType);
  const [description, setDescription] = useState(initialDescription);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Community Board state - initialized from local cache for instant 0ms render (SWR pattern)
  const [boardItems, setBoardItems] = useState<CommunityBoardItem[]>(() => getCachedBoard());
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [votedMap, setVotedMap] = useState<Record<string, boolean>>({});
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BUG' | 'FEATURE'>('ALL');

  const { tenantId, role } = useAuthStore();

  const loadBoard = useCallback(async (showBlockingLoader = false) => {
    if (showBlockingLoader) {
      setIsLoadingBoard(true);
    }
    setBoardError(null);
    try {
      const items = await getProjectCommunityBoard();
      setBoardItems(items);
    } catch (err: unknown) {
      setBoardItems((current) => {
        if (current.length === 0) {
          const msg = err instanceof Error ? err.message : 'Could not load community board';
          setBoardError(msg);
        }
        return current;
      });
    } finally {
      setIsLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    // Check local cache; if empty show loader, otherwise silently revalidate in background
    const cached = getCachedBoard();
    loadBoard(cached.length === 0);
  }, [loadBoard]);

  const handleUpvote = useCallback(async (taskId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (votedMap[taskId]) return;

    try {
      const newCount = await upvoteTaskBridgeTask(taskId);
      setVotedMap((prev) => ({ ...prev, [taskId]: true }));
      setBoardItems((prev) => {
        const updated = prev.map((item) => (item.id === taskId ? { ...item, upvotes: newCount } : item));
        saveBoardToCache(updated);
        return updated;
      });
      setToast({
        title: 'Upvote Recorded',
        text: 'Thank you for helping prioritize this!',
        type: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upvote failed';
      setToast({
        title: 'Upvote',
        text: msg,
        type: 'warning',
      });
    }
  }, [votedMap]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setErrorMessage('Please describe what happened or what you would like to see.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    // Auto-derive concise title from description
    const firstLine = trimmedDesc.split('\n')[0].trim();
    const autoTitle = firstLine.length > 70
      ? `${firstLine.slice(0, 67)}...`
      : (firstLine || `${type === 'BUG' ? 'Issue' : 'Feature'} Report`);

    const submissionData: TaskBridgeSubmission = {
      title: autoTitle,
      description: trimmedDesc,
      type,
      context: {
        app: 'Nafid POS',
        tenantId: tenantId || 'anonymous',
        userRole: role || 'unknown',
        screen: typeof window !== 'undefined' ? window.location.pathname || 'POS' : 'POS',
        screenResolution: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown',
      },
    };

    try {
      await submitToTaskBridge(submissionData);
      setIsSuccess(true);
      // Immediately refresh community board and update cache so it appears right away
      loadBoard(false);
      setToast({
        title: 'Feedback Submitted',
        text: 'Thank you for helping us improve!',
        type: 'success',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit feedback';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForAnother = () => {
    setDescription('');
    setIsSuccess(false);
    setErrorMessage(null);
    setActiveTab('NEW');
  };

  const filteredItems = boardItems.filter((item) => {
    if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="w-4 h-4" />
            </span>
            <span>Feedback & Support</span>
          </div>
        }
        className="max-w-lg"
      >
        <div className="space-y-4">
          {/* Top navigation tabs with app-native styling */}
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsSuccess(false);
                  setActiveTab('NEW');
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'NEW'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Give Feedback</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSuccess(false);
                  setActiveTab('BOARD');
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'BOARD'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Community Board</span>
                {boardItems.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-primary-foreground/20">
                    {boardItems.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* TAB 1: GIVE FEEDBACK (Clean, App-themed form) */}
          {activeTab === 'NEW' && (
            <>
              {isSuccess ? (
                <div className="space-y-5 py-4 text-center animate-in fade-in duration-200">
                  <div className="w-14 h-14 mx-auto bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center border border-emerald-500/20">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-foreground">Submitted Successfully</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Your feedback has been received and added to our backlog.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetForAnother}
                      className="text-xs"
                    >
                      Submit Another
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      onClick={() => setActiveTab('BOARD')}
                      className="text-xs"
                    >
                      View Community Board
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 text-left">
                  {errorMessage && (
                    <div className="p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-xl text-xs flex items-start gap-2 animate-in fade-in">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="font-medium leading-relaxed">{errorMessage}</span>
                    </div>
                  )}

                  {/* Type selector */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setType('BUG')}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          type === 'BUG'
                            ? 'bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 shadow-xs'
                            : 'bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/60'
                        }`}
                      >
                        <AlertCircle className="w-4 h-4" />
                        <span>Issue / Defect</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setType('FEATURE')}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          type === 'FEATURE'
                            ? 'bg-primary/10 border-primary/40 text-primary shadow-xs'
                            : 'bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/60'
                        }`}
                      >
                        <Lightbulb className="w-4 h-4" />
                        <span>Feature Request</span>
                      </button>
                    </div>
                  </div>

                  {/* Description textarea */}
                  <div className="space-y-1.5">
                    <label htmlFor="tb-desc" className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      {type === 'BUG' ? 'Issue Details' : 'Feature Idea'} <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      id="tb-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      placeholder={
                        type === 'BUG'
                          ? 'Explain what went wrong or how to reproduce it...'
                          : 'Explain your idea or how this feature should work...'
                      }
                      disabled={isSubmitting}
                      required
                      autoFocus
                      className="flex w-full rounded-xl border border-input bg-background/50 px-3.5 py-2.5 text-xs font-semibold text-foreground placeholder:text-muted-foreground/45 transition-all focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-background disabled:cursor-not-allowed disabled:opacity-50 resize-y leading-relaxed"
                    />
                  </div>

                  {/* Submit Action */}
                  <div className="pt-3 border-t border-border/40">
                    <Button
                      type="submit"
                      variant="default"
                      disabled={isSubmitting || !description.trim()}
                      className="w-full gap-2 h-10 text-xs font-bold cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Submit Feedback</span>
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* TAB 2: COMMUNITY BOARD */}
          {activeTab === 'BOARD' && (
            <div className="space-y-3">
              {/* Search and filters */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search existing issues & ideas..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/40 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-primary focus:bg-background"
                  />
                </div>
                <div className="flex items-center p-0.5 bg-muted/50 rounded-lg border border-border/60 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setTypeFilter('ALL')}
                    className={`px-2 py-1 rounded-md transition-all ${
                      typeFilter === 'ALL' ? 'bg-background text-foreground shadow-2xs font-bold' : 'text-muted-foreground'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('BUG')}
                    className={`px-2 py-1 rounded-md transition-all ${
                      typeFilter === 'BUG' ? 'bg-background text-foreground shadow-2xs font-bold' : 'text-muted-foreground'
                    }`}
                  >
                    Bugs
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('FEATURE')}
                    className={`px-2 py-1 rounded-md transition-all ${
                      typeFilter === 'FEATURE' ? 'bg-background text-foreground shadow-2xs font-bold' : 'text-muted-foreground'
                    }`}
                  >
                    Ideas
                  </button>
                </div>
              </div>

              {/* Items List */}
              {isLoadingBoard && boardItems.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground space-y-2">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                  <p className="text-xs">Loading community board...</p>
                </div>
              ) : boardError && boardItems.length === 0 ? (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs text-center space-y-2">
                  <p>{boardError}</p>
                  <Button variant="outline" size="sm" onClick={() => loadBoard(true)}>
                    Retry
                  </Button>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground space-y-3 bg-muted/20 border border-dashed border-border/80 rounded-xl p-6">
                  <MessageSquare className="w-8 h-8 text-muted-foreground/50 mx-auto" />
                  <div>
                    <p className="text-xs font-bold text-foreground">No community feedback listed yet</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {searchQuery ? 'Try another search term or share your feedback directly.' : 'Be the first to share an idea or report an issue!'}
                    </p>
                  </div>
                  <Button variant="default" size="sm" onClick={() => setActiveTab('NEW')}>
                    Give Feedback
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {filteredItems.map((item) => {
                    const badge = getStatusBadge(item.status);
                    const isVoted = !!votedMap[item.id];
                    return (
                      <div
                        key={item.id}
                        className="p-3 bg-card border border-border/70 rounded-xl flex items-start gap-3 hover:border-border transition-all shadow-2xs"
                      >
                        {/* Upvote button */}
                        <button
                          type="button"
                          onClick={(e) => handleUpvote(item.id, e)}
                          title="Vote to prioritize this item"
                          className={`flex flex-col items-center justify-center min-w-[42px] px-2 py-1.5 rounded-lg border text-xs font-black transition-all cursor-pointer ${
                            isVoted
                              ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                              : 'bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-foreground border-border/80'
                          }`}
                        >
                          <ArrowUp className={`w-3.5 h-3.5 ${isVoted ? 'stroke-[3]' : ''}`} />
                          <span className="text-[11px] leading-tight mt-0.5">{item.upvotes || 0}</span>
                        </button>

                        {/* Item Details */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-xs font-bold text-foreground leading-snug line-clamp-2">
                              {item.title}
                            </h4>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                              item.is_pending_review
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                : badge.color
                            }`}>
                              {item.is_pending_review ? 'Under Review' : badge.label}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 pt-0.5 text-[10px] text-muted-foreground/70">
                            <span className="font-semibold uppercase tracking-wider">
                              {item.type === 'BUG' ? '🐛 Bug' : '💡 Feature'}
                            </span>
                            {item.task_number && <span>&bull; #{item.task_number}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <p className="pt-1 text-center text-[10px] text-muted-foreground/70">
                    Fixed items are shown for {getBoardWindow().days} days (latest {getBoardWindow().limit}).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {toast && (
        <FloatToast
          message={toast}
          onClose={() => setToast(null)}
          duration={4000}
        />
      )}
    </>
  );
}

export function TaskBridgeFeedbackModal(props: TaskBridgeFeedbackModalProps) {
  if (!props.isOpen) return null;
  return <TaskBridgeFeedbackModalInner {...props} />;
}

/**
 * Modern, theme-aware Floating Action Button (FAB) for Feedback & Support.
 * Adapts seamlessly to Light and Dark themes.
 */
export function TaskBridgeFeedbackFAB({
  className = '',
}: {
  className?: string;
}) {
  // Only open items count: fixed or closed ones would make the badge grow forever.
  const [count, setCount] = useState<number>(() => openItemCount(getCachedBoard()));

  useEffect(() => {
    getProjectCommunityBoard()
      .then((items) => setCount(openItemCount(items)))
      .catch(() => {});
  }, []);

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('open-taskbridge-feedback'));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`fixed bottom-16 right-6 z-40 group flex items-center gap-2 px-3.5 h-11 rounded-full bg-card hover:bg-muted/80 text-foreground border border-border/80 hover:border-primary/50 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none backdrop-blur-md ${className}`}
      title="Feedback & Support"
      aria-label="Feedback & Support"
    >
      <div className="relative">
        <MessageSquare className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:scale-110" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
        )}
      </div>
      <span className="text-xs font-bold tracking-tight">Feedback</span>
      {count > 0 && (
        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-primary/10 text-primary border border-primary/20">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Standard inline trigger button if needed.
 */
export function TaskBridgeFeedbackButton({
  className = '',
  label = 'Feedback',
  compact = false,
}: {
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('open-taskbridge-feedback'));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-foreground bg-card hover:bg-muted border border-border/80 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer ${className}`}
      title="Feedback & Support"
      aria-label="Feedback & Support"
    >
      <MessageSquare className="w-4 h-4 text-primary shrink-0" />
      {!compact && <span>{label}</span>}
    </button>
  );
}
