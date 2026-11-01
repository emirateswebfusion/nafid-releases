import { useState, useMemo } from 'react';
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  RotateCcw,
  Search,
  Check,
  SlidersHorizontal,
  CheckCircle2,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { useFeatureFlagsStore, cashierPageTitle } from '../../config/featureFlags';
import { useDashboardCardsStore } from '../../store/dashboardCardsStore';
import { RestoreDefaultCardsDialog } from './RestoreDefaultCardsDialog';
import { ALL_CARD_DEFINITIONS, type CardMetaItem } from './cardDefinitions';
export type { CardMetaItem };

interface DashboardCardCustomizerProps {
  onClose?: () => void;
  allowedCardIds?: string[];
}

export function DashboardCardCustomizer({
  onClose,
  allowedCardIds,
}: DashboardCardCustomizerProps) {
  const { tenantId, userId, role } = useAuthStore();
  const { flags: featureFlags } = useFeatureFlagsStore();
  const { cardOrder, setCardOrder, moveCard } = useDashboardCardsStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);

  // Dynamic titles and definitions
  const cardDefinitions = useMemo(() => {
    const cashierTitle = cashierPageTitle(featureFlags);
    return {
      ...ALL_CARD_DEFINITIONS,
      cashier: {
        ...ALL_CARD_DEFINITIONS.cashier,
        title: cashierTitle,
      },
    };
  }, [featureFlags]);

  // Filtered order based on allowedCardIds (if provided) and user's order
  const orderedCards = useMemo(() => {
    return cardOrder
      .filter((id) => !allowedCardIds || allowedCardIds.includes(id))
      .map((id) => {
        const def = (cardDefinitions as Record<string, (typeof cardDefinitions)[keyof typeof cardDefinitions] | undefined>)[id] || {
          title: id.replace(/-/g, ' ').toUpperCase(),
          desc: 'Dashboard module',
          icon: SlidersHorizontal,
          color: 'text-primary',
          bgColor: 'bg-primary/10',
        };
        return {
          id,
          ...def,
        };
      });
  }, [cardOrder, allowedCardIds, cardDefinitions]);

  // Visible search filtered cards
  const displayCards = useMemo(() => {
    if (!searchQuery.trim()) return orderedCards;
    const q = searchQuery.toLowerCase().trim();
    return orderedCards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
  }, [orderedCards, searchQuery]);

  const notifySaved = () => {
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  const handleMove = (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => {
    moveCard(id, dir, tenantId, userId, role);
    notifySaved();
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedCardId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCardId !== id) {
      setDragOverCardId(id);
    }
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setDragOverCardId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedCardId;
    if (!sourceId || sourceId === targetId) {
      setDraggedCardId(null);
      setDragOverCardId(null);
      return;
    }

    const current = [...cardOrder];
    const sourceIdx = current.indexOf(sourceId);
    const targetIdx = current.indexOf(targetId);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      const [moved] = current.splice(sourceIdx, 1);
      current.splice(targetIdx, 0, moved);
      setCardOrder(current, tenantId, userId, role);
      notifySaved();
    }

    setDraggedCardId(null);
    setDragOverCardId(null);
  };

  const handleReset = () => {
    setShowRestoreDialog(true);
  };

  return (
    <div className="flex flex-col h-full space-y-4 w-full">
      {/* Top Description and Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-muted/40 p-4 rounded-2xl border border-border w-full">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-foreground">
              Dashboard Cards Sequence
            </h3>
            {saveToast && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full animate-in fade-in">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Drag cards or use the arrow buttons to set your custom order. 1st card will appear first on the POS dashboard.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted bg-background border border-border rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
            title="Reset to factory default sequence (Billing first, Cashier second...)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative w-full">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter modules (e.g. Billing, Cashier, Inventory...)"
          className="w-full pl-9 pr-4 py-2 text-xs bg-muted/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Cards List */}
      <div
        className={clsx(
          'space-y-2 w-full',
          onClose ? 'max-h-[58vh] overflow-y-auto overscroll-contain pr-1' : ''
        )}
      >
        {displayCards.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs">
            No cards found matching "{searchQuery}"
          </div>
        ) : (
          displayCards.map((card, _idx) => {
            const overallIndex = orderedCards.findIndex((c) => c.id === card.id);
            const isFirst = overallIndex === 0;
            const isLast = overallIndex === orderedCards.length - 1;
            const Icon = card.icon;
            const isDragged = draggedCardId === card.id;
            const isDragOver = dragOverCardId === card.id && !isDragged;

            return (
              <div
                key={card.id}
                draggable
                onDragStart={(e) => handleDragStart(e, card.id)}
                onDragOver={(e) => handleDragOver(e, card.id)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, card.id)}
                className={clsx(
                  'group flex items-center gap-3 p-3 rounded-xl border bg-card transition-all duration-200 select-none w-full',
                  isDragged && 'opacity-40 scale-[0.98] border-primary border-dashed bg-primary/5',
                  isDragOver && 'border-primary ring-2 ring-primary/30 bg-primary/10',
                  !isDragged && !isDragOver && 'hover:border-primary/50 hover:bg-muted/40 shadow-xs'
                )}
              >
                {/* Drag Handle & Position Badge */}
                <div className="flex items-center gap-2 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                  <GripVertical className="w-4 h-4" />
                  <span className="w-6 h-6 rounded-lg bg-muted border border-border text-[11px] font-mono font-bold flex items-center justify-center text-foreground">
                    #{overallIndex + 1}
                  </span>
                </div>

                {/* Card Icon */}
                <div
                  className={clsx(
                    'p-2 rounded-lg shrink-0 shadow-xs',
                    card.bgColor,
                    card.color
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground truncate">
                      {card.title}
                    </span>
                    {card.badge && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded-full">
                        {card.badge}
                      </span>
                    )}
                    {card.shortcut && (
                      <span className="text-[9px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                        {card.shortcut}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {card.desc}
                  </p>
                </div>

                {/* Position Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Move to Top */}
                  <button
                    onClick={() => handleMove(card.id, 'top')}
                    disabled={isFirst}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-all cursor-pointer',
                      isFirst
                        ? 'opacity-30 cursor-not-allowed border-transparent text-muted-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95'
                    )}
                    title="Move to First Position (#1)"
                  >
                    <ChevronsUp className="w-3.5 h-3.5" />
                  </button>

                  {/* Move Up */}
                  <button
                    onClick={() => handleMove(card.id, 'up')}
                    disabled={isFirst}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-all cursor-pointer',
                      isFirst
                        ? 'opacity-30 cursor-not-allowed border-transparent text-muted-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95'
                    )}
                    title="Move Up 1 step"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>

                  {/* Move Down */}
                  <button
                    onClick={() => handleMove(card.id, 'down')}
                    disabled={isLast}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-all cursor-pointer',
                      isLast
                        ? 'opacity-30 cursor-not-allowed border-transparent text-muted-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95'
                    )}
                    title="Move Down 1 step"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Move to Bottom */}
                  <button
                    onClick={() => handleMove(card.id, 'bottom')}
                    disabled={isLast}
                    className={clsx(
                      'p-1.5 rounded-lg border transition-all cursor-pointer',
                      isLast
                        ? 'opacity-30 cursor-not-allowed border-transparent text-muted-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95'
                    )}
                    title="Move to Last Position"
                  >
                    <ChevronsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer info & close */}
      <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground w-full">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
          <span>Ordering is automatically synchronized with your user profile</span>
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-95 transition-opacity cursor-pointer shadow-sm"
          >
            Done
          </button>
        )}
      </div>

      {/* Custom Restore Defaults Confirmation Dialog */}
      <RestoreDefaultCardsDialog
        isOpen={showRestoreDialog}
        onClose={() => setShowRestoreDialog(false)}
        onSuccess={notifySaved}
      />
    </div>
  );
}
