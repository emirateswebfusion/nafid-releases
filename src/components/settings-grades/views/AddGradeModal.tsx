import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import type React from 'react';
import { Check, Loader2, Tag, X } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../../ui/Modal';
import type { SettingsGradesState } from '../hooks/useSettingsGradesState';

export interface AddGradeModalProps {
  categories: string[];
  handleAdd: () => Promise<void>;
  handleFormKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  sg: SettingsGradesState;
}

/** Add grade modal with category suggestions and price fields. */
export function AddGradeModal({ categories, handleAdd, handleFormKeyDown, sg }: AddGradeModalProps) {
  const { isAdding, newForm, operating, setIsAdding, setNewForm } = sg;
  return (
    <Modal
      isOpen={isAdding}
      onClose={() => !operating && setIsAdding(false)}
      closeButton={
        <button
          onClick={() => !operating && setIsAdding(false)}
          className="p-2 rounded-xl border border-destructive/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-95 cursor-pointer"
          title="Close"
          disabled={operating}
        >
          <X className="w-4 h-4 text-destructive" />
        </button>
      }
      title={
        <div className="flex items-center gap-2 select-none">
          <Tag className="w-5 h-5 text-primary" />
          <span className="font-black text-sm uppercase tracking-widest text-foreground">New Category &amp; Grade</span>
        </div>
      }
      className="max-w-xl"
    >
      <section className="bg-card border border-border rounded-[28px] p-6 shadow-sm transition-all duration-300" onKeyDown={handleFormKeyDown}>
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border" data-enter-nav>
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Tag className="w-4 h-4" />
          </div>
          <span className="text-xs font-black text-primary uppercase tracking-wider">Category Details</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Category name *
            </label>
            <input
              placeholder="e.g. Steel, Brass, Copper"
              value={newForm.category}
              onChange={e => setNewForm({ ...newForm, category: e.target.value })}
              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
            />
            {categories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewForm({ ...newForm, category: cat })}
                    className={clsx(
                      'px-3 py-1.5 text-xs font-bold rounded-xl border transition-all duration-200 cursor-pointer',
                      newForm.category === cat
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'bg-muted/50 hover:bg-primary/5 hover:text-primary text-muted-foreground border-border/40'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Grade variant (optional)
            </label>
            <input
              placeholder="e.g. Grade A, Scrap"
              value={newForm.grade_name}
              onChange={e => setNewForm({ ...newForm, grade_name: e.target.value })}
              className="w-full bg-background border border-border rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
            />
            <p className="text-xs text-muted-foreground/70 mt-1">
              Optional — leave blank for a general grade under this category.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Purchase
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">{getCurrencyPrefix()}</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={newForm.purchase_price || ''}
                  onChange={e => setNewForm({ ...newForm, purchase_price: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-background border border-border rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm no-spinners font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                MRP
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">{getCurrencyPrefix()}</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={newForm.rate || ''}
                  onChange={e => setNewForm({ ...newForm, rate: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-background border border-border rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm no-spinners font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Offer
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">{getCurrencyPrefix()}</span>
                <input
                  type="number"
                  placeholder="0.00"
                   value={newForm.offer_price || ''}
                  onChange={e => setNewForm({ ...newForm, offer_price: e.target.value === '' ? null : (parseFloat(e.target.value) || 0) })}
                  className="w-full bg-background border border-border rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm no-spinners font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={handleAdd}
          disabled={operating}
          className="flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-sm"
        >
          {operating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Save Grade
        </button>
      </div>
    </Modal>
  );
}
