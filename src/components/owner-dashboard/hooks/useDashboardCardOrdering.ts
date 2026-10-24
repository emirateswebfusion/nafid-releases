import type React from 'react';
import type { OwnerDashboardState } from './useOwnerDashboardState';

export interface UseDashboardCardOrderingContext {
  cardOrder: string[];
  role: "SUPER_ADMIN" | "ADMIN" | "STAFF" | null;
  setCardOrder: (order: string[], tenantId?: string | null, userId?: string | null, role?: string | null) => Promise<void>;
  tenantId: string | null;
  userId: string | null;
  visibleCardIds: string[];
  od: OwnerDashboardState;
}

export function useDashboardCardOrdering(ctx: UseDashboardCardOrderingContext) {
  const { cardOrder, role, setCardOrder, tenantId, userId, visibleCardIds } = ctx;
  const { draggedDashboardCardId, dragOverDashboardCardId, setDraggedDashboardCardId, setDragOverDashboardCardId } = ctx.od;
  const handleShiftCard = (cardId: string, direction: 'prev' | 'next') => {
    const visIdx = visibleCardIds.indexOf(cardId);
    if (visIdx === -1) return;
    const targetVisIdx = direction === 'prev' ? visIdx - 1 : visIdx + 1;
    if (targetVisIdx < 0 || targetVisIdx >= visibleCardIds.length) return;
    const targetId = visibleCardIds[targetVisIdx];

    const current = [...cardOrder];
    const sourceIdx = current.indexOf(cardId);
    const targetIdx = current.indexOf(targetId);
    if (sourceIdx !== -1 && targetIdx !== -1) {
      const [moved] = current.splice(sourceIdx, 1);
      current.splice(targetIdx, 0, moved);
      setCardOrder(current, tenantId, userId, role);
    }
  };

  const handleDashboardCardDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedDashboardCardId(id);
  };

  const handleDashboardCardDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDashboardCardId !== id) {
      setDragOverDashboardCardId(id);
    }
  };

  const handleDashboardCardDragEnd = () => {
    setDraggedDashboardCardId(null);
    setDragOverDashboardCardId(null);
  };

  const handleDashboardCardDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedDashboardCardId;
    if (!sourceId || sourceId === targetId) {
      setDraggedDashboardCardId(null);
      setDragOverDashboardCardId(null);
      return;
    }

    const current = [...cardOrder];
    const sourceIdx = current.indexOf(sourceId);
    const targetIdx = current.indexOf(targetId);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      const [moved] = current.splice(sourceIdx, 1);
      current.splice(targetIdx, 0, moved);
      setCardOrder(current, tenantId, userId, role);
    }

    setDraggedDashboardCardId(null);
    setDragOverDashboardCardId(null);
  };

  return { handleShiftCard, handleDashboardCardDragStart, handleDashboardCardDragOver, handleDashboardCardDragEnd, handleDashboardCardDrop };
}
