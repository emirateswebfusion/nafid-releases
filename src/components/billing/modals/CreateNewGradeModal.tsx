import React from 'react';
import { Tag, X, Check, Loader2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';

interface CreateNewGradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  form: {
    grade_name: string;
    purchase_price: string;
    rate: string;
    offer_price: string;
  };
  setForm: (val: any) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onSubmit: () => void;
  saving: boolean;
}

export function CreateNewGradeModal({
  isOpen,
  onClose,
  category,
  form,
  setForm,
  onKeyDown,
  onSubmit,
  saving,
}: CreateNewGradeModalProps) {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Grade"
      className="max-w-lg backdrop-blur-none"
      overlayClassName="z-[110]"
      closeButton={
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200 active:scale-95 cursor-pointer border border-destructive/30"
          title="Close"
        >
          <X className="w-4 h-4 text-destructive" />
        </button>
      }
    >
      <div className="space-y-3" onKeyDown={onKeyDown} data-enter-nav>
        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          Grade for category: <span className="font-bold text-foreground">{category}</span>
        </p>
        <section className="bg-background border border-border/80 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Tag className="w-4 h-4" />
            </div>
            <span className="text-xs font-black text-blue-500 uppercase tracking-wider">Grade Details</span>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Grade Name *</label>
              <input
                autoFocus
                placeholder="e.g. Grade A, Scrap, Heavy"
                value={form.grade_name}
                onChange={e => setForm({ ...form, grade_name: e.target.value })}
                className="w-full bg-background border border-border rounded-xl p-3 text-foreground font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Cost Price</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.purchase_price}
                  onChange={e => setForm({ ...form, purchase_price: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl p-3 text-foreground font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Selling Price</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.rate}
                  onChange={e => setForm({ ...form, rate: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl p-3 text-foreground font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Offer Price</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.offer_price}
                  onChange={e => setForm({ ...form, offer_price: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl p-3 text-foreground font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
                />
              </div>
            </div>
          </div>
        </section>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-muted transition-all active:scale-95 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            data-enter-submit
            onClick={onSubmit}
            disabled={saving || !form.grade_name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/95 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-sm"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Save Grade
          </button>
        </div>
      </div>
    </Modal>
  );
}
