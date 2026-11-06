import React from 'react';
import { Shield, GripVertical, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '../../ui/Card';
import type { LucideProps } from 'lucide-react';
import type { OwnerDashboardState } from '../hooks/useOwnerDashboardState';

export interface DashboardCardGridProps {
  handleDashboardCardDragEnd: () => void;
  handleDashboardCardDragOver: (e: React.DragEvent, id: string) => void;
  handleDashboardCardDragStart: (e: React.DragEvent, id: string) => void;
  handleDashboardCardDrop: (e: React.DragEvent, targetId: string) => void;
  handleShiftCard: (cardId: string, direction: "prev" | "next") => void;
  isEditMode: boolean;
  visibleCards: ({ id: string; title: string; desc: string; icon: React.ForwardRefExoticComponent<Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>>; color: string; bgColor: string; action: () => boolean; shortcut: string; perm: string; badge?: undefined; } | { id: string; title: string; desc: string; icon: React.ForwardRefExoticComponent<Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>>; color: string; bgColor: string; action: () => boolean; perm: string; shortcut?: undefined; badge?: undefined; } | { id: string; title: string; desc: string; icon: React.ForwardRefExoticComponent<Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>>; color: string; bgColor: string; action: () => boolean; perm: string; badge?: string; shortcut?: undefined; } | { id: string; title: string; desc: string; icon: React.ForwardRefExoticComponent<Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>>; color: string; bgColor: string; action: () => boolean; badge?: string; shortcut?: undefined; perm?: undefined; })[];
  od: OwnerDashboardState;
}

/** Dashboard card grid: empty state, or the visible feature cards with drag-to-reorder and shift controls in edit mode. */
export function DashboardCardGrid({
  handleDashboardCardDragEnd, handleDashboardCardDragOver, handleDashboardCardDragStart, handleDashboardCardDrop,
  handleShiftCard, isEditMode, visibleCards, od,
}: DashboardCardGridProps) {
  const { draggedDashboardCardId, dragOverDashboardCardId, gridMode } = od;
  return (
    <>
    {visibleCards.length === 0 ? (
      <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4 shadow-sm border border-amber-500/20">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">No Modules Assigned</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your staff account does not currently have access to any dashboard modules. Please contact your store administrator to assign permissions for your account.
        </p>
      </div>
    ) : (
      <div className={clsx(
        "grid gap-3 items-stretch transition-all duration-300",
        gridMode === '2COL' && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        gridMode === '3COL' && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
      )}>
        {visibleCards.map((card, cardIndex) => {
          const isDragged = draggedDashboardCardId === card.id;
          const isDragOver = dragOverDashboardCardId === card.id && !isDragged;
          const isFirst = cardIndex === 0;
          const isLast = cardIndex === visibleCards.length - 1;

          return (
            <Card
              key={card.id}
              draggable={isEditMode}
              onDragStart={isEditMode ? (e) => handleDashboardCardDragStart(e, card.id) : undefined}
              onDragOver={isEditMode ? (e) => handleDashboardCardDragOver(e, card.id) : undefined}
              onDragEnd={isEditMode ? handleDashboardCardDragEnd : undefined}
              onDrop={isEditMode ? (e) => handleDashboardCardDrop(e, card.id) : undefined}
              onClick={isEditMode ? undefined : card.action}
              className={clsx(
                "flex flex-col text-left transition-all duration-300",
                isEditMode
                  ? "cursor-grab active:cursor-grabbing border-dashed border-primary/40 bg-card hover:border-primary select-none"
                  : "cursor-pointer group hover:border-primary/50 hover:bg-muted/30",
                isDragged && "opacity-40 scale-[0.98] border-primary ring-2 ring-primary/40",
                isDragOver && "ring-2 ring-primary border-primary bg-primary/10"
              )}
            >
              <CardHeader className="flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  {isEditMode && (
                    <div className="flex items-center gap-1 mr-1 text-muted-foreground">
                      <GripVertical className="w-4 h-4 shrink-0" />
                      <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-mono font-bold text-foreground border border-border">
                        #{cardIndex + 1}
                      </span>
                    </div>
                  )}
                  <div className={clsx(
                    "p-3 rounded-xl shadow-sm transition-transform duration-300",
                    !isEditMode && "group-hover:scale-105",
                    card.bgColor, card.color
                  )}>
                    <card.icon className="w-6 h-6" />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isEditMode ? (
                    <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleShiftCard(card.id, 'prev')}
                        disabled={isFirst}
                        className={clsx(
                          "p-1 rounded transition-colors cursor-pointer",
                          isFirst ? "opacity-30 cursor-not-allowed text-muted-foreground" : "hover:bg-card text-foreground active:scale-95"
                        )}
                        title="Move 1 step left/earlier"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-[10px] font-bold text-muted-foreground px-1">
                        {cardIndex + 1}/{visibleCards.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleShiftCard(card.id, 'next')}
                        disabled={isLast}
                        className={clsx(
                          "p-1 rounded transition-colors cursor-pointer",
                          isLast ? "opacity-30 cursor-not-allowed text-muted-foreground" : "hover:bg-card text-foreground active:scale-95"
                        )}
                        title="Move 1 step right/later"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {(card as { badge?: string }).badge && (
                        (card as { badge?: string }).badge === 'NEW' ? (
                          <span className="animate-new-badge relative inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-gradient-to-r from-emerald-500/15 via-teal-500/20 to-emerald-500/15 border border-emerald-500/40 dark:border-emerald-400/40 px-2.5 py-0.5 rounded-full select-none">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="font-extrabold tracking-wider">NEW</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {(card as { badge?: string }).badge}
                          </span>
                        )
                      )}
                      {card.shortcut && (
                        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border">
                          {card.shortcut}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col pt-4">
                <CardTitle className={clsx("text-xl mb-2 transition-colors", !isEditMode && "group-hover:text-primary")}>
                  {card.title}
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed mb-6">
                  {card.desc}
                </CardDescription>

                <div className="mt-auto flex items-center justify-between text-xs font-bold text-muted-foreground">
                  {isEditMode ? (
                    <span className="text-[11px] text-primary flex items-center gap-1">
                      <GripVertical className="w-3.5 h-3.5" /> Drag or use ◀ ▶ arrows to move
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 group-hover:text-primary transition-colors">
                      <span>Open</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    )}
    </>
  );
}
