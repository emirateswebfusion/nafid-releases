import { type RefObject } from 'react';
import { Plus, Trash, Pencil, Check, X, Loader2, Tags, Shield, Star, GripVertical, IndianRupee } from 'lucide-react';
import { Skeleton } from '../../ui/Skeleton';
import clsx from 'clsx';
import type { PricingTier } from '../../../utils/pricingTierHelper';
import { isTierDefault } from '../pricingTiersTypes';
import type { PricingTiersState } from '../hooks/usePricingTiersState';

export interface TiersListViewProps {
  handleAddTier: () => Promise<void>;
  handleDeleteTier: (tier: PricingTier) => Promise<void>;
  handleRenameTier: (tier: PricingTier) => Promise<void>;
  handleSetDefaultTier: (tier: PricingTier) => Promise<void>;
  isOwner: boolean;
  newNameRef: RefObject<HTMLInputElement | null>;
  pt: PricingTiersState;
  reorderTier: (fromIndex: number, toIndex: number) => Promise<void>;
  toggleActive: (tier: PricingTier) => Promise<void>;
  toggleOverride: (value: boolean) => Promise<void>;
}

/** Tiers tab: create-tier card, draggable tier table with inline rename / delete, and the staff price-override switch. */
export function TiersListView({
  handleAddTier, handleDeleteTier, handleRenameTier, handleSetDefaultTier, isOwner, newNameRef, pt, reorderTier,
  toggleActive, toggleOverride,
}: TiersListViewProps) {
  const {
    allowBillerOverride, confirmDeleteId, draggedIndex, dragOverIndex, editName, editingId, loading, newName, operating,
    setConfirmDeleteId, setDraggedIndex, setDragOverIndex, setEditName, setEditingId, setNewName, setTierFilter, setView,
    tiers,
  } = pt;
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full px-4 sm:px-6 pt-6 pb-10 space-y-4">

        {/* Create Tier Card */}
        <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Tags className="w-4 h-4" /></div>
            <span className="text-xs font-black text-primary uppercase tracking-wider">Create New Tier</span>
          </div>
          <div className="flex gap-3">
            <input
              ref={newNameRef}
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTier()}
              placeholder="e.g. Retail, Wholesale, Tier A, B2B…"
              className="flex-1 bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm font-semibold"
            />
            <button
              onClick={handleAddTier}
              disabled={operating || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground shadow-sm font-bold hover:bg-primary/95 transition-all active:scale-95 py-2.5 px-5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {operating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Tier
            </button>
          </div>
        </section>

        {/* Tiers Table */}
        <section className="bg-card border border-border rounded-[28px] overflow-hidden shadow-sm">
          {/* Column Header */}
          <div className="grid grid-cols-12 gap-3 px-6 py-3.5 bg-muted/20 dark:bg-muted/10 border-b border-border select-none">
            <div className="col-span-1 text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <span>Sl. No.</span>
            </div>
            <div className="col-span-5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Tier Name</div>
            <div className="col-span-2 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest">Status</div>
            <div className="col-span-2 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest">Active</div>
            <div className="col-span-2 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest">Actions</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {loading ? (
              [1, 2, 3, 4].map(i => (
                <div key={i} className="grid grid-cols-12 gap-3 px-6 py-4 items-center">
                  <div className="col-span-1 flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-md" />
                  </div>
                  <div className="col-span-5">
                    <Skeleton className="h-4 w-48 rounded-lg" />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <Skeleton className="h-5 w-10 rounded-full" />
                  </div>
                  <div className="col-span-2 flex justify-center gap-2">
                    <Skeleton className="h-7 w-7 rounded-lg" />
                    <Skeleton className="h-7 w-7 rounded-lg" />
                  </div>
                </div>
              ))
            ) : tiers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Tags className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-bold text-sm text-foreground">No pricing tiers yet</p>
                <p className="text-xs mt-1">Create one above to get started</p>
              </div>
            ) : tiers.map((tier, index) => (
              <div
                key={tier.pricing_tier_id || index}
                draggable={!operating}
                onDragStart={(e) => {
                  setDraggedIndex(index);
                  e.dataTransfer.setData('text/plain', String(index));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverIndex !== index) setDragOverIndex(index);
                }}
                onDragLeave={() => {
                  if (dragOverIndex === index) setDragOverIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedIndex !== null && draggedIndex !== index) {
                    reorderTier(draggedIndex, index);
                  }
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                className={clsx(
                  'grid grid-cols-12 gap-3 px-6 py-3.5 items-center transition-all duration-150',
                  draggedIndex === index && 'opacity-40 bg-primary/10 border-2 border-dashed border-primary',
                  dragOverIndex === index && draggedIndex !== index && 'bg-primary/15 border-t-2 border-t-primary scale-[1.01]',
                  draggedIndex !== index && dragOverIndex !== index && 'hover:bg-muted/30',
                  !tier.is_active && 'opacity-60'
                )}
              >
                {/* Drag Handle & Sl. No. */}
                <div className="col-span-1 flex items-center gap-2">
                  <div
                    className="p-1.5 text-muted-foreground/60 hover:text-primary active:text-primary cursor-grab active:cursor-grabbing rounded-lg hover:bg-muted transition-colors shrink-0"
                    title="Click & drag to reorder tier position"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground w-4 text-center">{index + 1}</span>
                </div>

                {/* Name / Inline Edit */}
                <div className="col-span-5">
                  {editingId === tier.pricing_tier_id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleRenameTier(tier)}
                        autoFocus
                        className="flex-1 bg-background border border-primary rounded-xl px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/10"
                      />
                      <div className="inline-flex items-center p-0.5 bg-muted/60 border border-border rounded-xl shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRenameTier(tier)}
                          className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 rounded-lg cursor-pointer transition-all active:scale-90"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <span className="w-px h-4 bg-border/60" />
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1.5 text-rose-500 hover:bg-rose-500/15 rounded-lg cursor-pointer transition-all active:scale-90"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={clsx('text-sm font-bold', (tier.is_mrp || tier.is_active) ? 'text-foreground' : 'text-muted-foreground line-through')}>
                          {tier.name}
                        </p>
                        {tier.is_mrp && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 shrink-0">
                            BASE MRP
                          </span>
                        )}
                        {isTierDefault(tier, tiers) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                        {tier.is_mrp
                          ? 'Base product selling price set in Product Catalog'
                          : tier.is_active ? 'Visible in Inventory & POS Billing' : 'Hidden from all selections'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Status Badge */}
                <div className="col-span-2 flex justify-center">
                  <span className={clsx(
                    'text-[10px] font-bold px-2.5 py-1 rounded-full border',
                    tier.is_mrp
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                      : tier.is_active
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-muted text-muted-foreground border-border/40'
                  )}>
                    {tier.is_mrp ? 'Base Rate' : tier.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>

                {/* Toggle Switch */}
                <div className="col-span-2 flex justify-center">
                  <button
                    onClick={() => toggleActive(tier)}
                    disabled={operating || tier.is_mrp}
                    title={tier.is_mrp ? 'Base MRP cannot be disabled' : tier.is_active ? 'Turn OFF' : 'Turn ON'}
                    className={clsx(
                      'relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50',
                      (tier.is_mrp || tier.is_active) ? 'bg-emerald-500' : 'bg-muted'
                    )}
                  >
                    <span className={clsx(
                      'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                      (tier.is_mrp || tier.is_active) ? 'left-[22px]' : 'left-0.5'
                    )} />
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="col-span-2 flex items-center justify-center gap-1">
                  <button
                    onClick={() => handleSetDefaultTier(tier)}
                    disabled={operating}
                    className={clsx(
                      'p-1.5 rounded-lg cursor-pointer transition-all',
                      isTierDefault(tier, tiers)
                        ? 'text-amber-400 hover:text-amber-500 bg-amber-500/10'
                        : 'text-muted-foreground hover:text-amber-400 hover:bg-muted'
                    )}
                    title={isTierDefault(tier, tiers) ? 'Default viewing tier in Billing (Click to unset)' : 'Set as Default viewing tier in Billing'}
                  >
                    <Star className={clsx('w-3.5 h-3.5', isTierDefault(tier, tiers) && 'fill-amber-400 text-amber-400')} />
                  </button>
                  {!tier.is_mrp && (
                    <>
                      <button
                        onClick={() => { setTierFilter(tier.pricing_tier_id); setView('matrix'); }}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg cursor-pointer"
                        title="Set Prices in Matrix"
                      >
                        <IndianRupee className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setEditingId(tier.pricing_tier_id); setEditName(tier.name); }}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg cursor-pointer"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteId === tier.pricing_tier_id ? (
                        <div className="inline-flex items-center gap-1 p-0.5 bg-muted/60 border border-border rounded-xl shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDeleteTier(tier)}
                            className="px-2.5 py-1 text-[10px] font-black bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg cursor-pointer transition-all active:scale-95"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg cursor-pointer transition-all active:scale-90"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(tier.pricing_tier_id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                          title="Delete"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Staff Permission (Owner Only) */}
        {isOwner && (
          <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500"><Shield className="w-4 h-4" /></div>
              <span className="text-xs font-black text-amber-500 uppercase tracking-wider">Staff Permissions</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-foreground">Allow Billing Staff to Override Prices</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cashiers can manually edit unit prices during checkout, outside tier rules
                </p>
              </div>
              <button
                onClick={() => toggleOverride(!allowBillerOverride)}
                className={clsx(
                  'relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0',
                  allowBillerOverride ? 'bg-emerald-500' : 'bg-muted'
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
                  allowBillerOverride ? 'left-[22px]' : 'left-0.5'
                )} />
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
