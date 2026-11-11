import { getCurrencyPrefix } from '../../../utils/localization/storeProfile';
import React from 'react';
import { Tag, Loader2, Check } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { RedCrossButton } from '../../ui/RedCrossButton';

export interface CreateGradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  newGradeForm: {
    grade_name: string;
    purchase_price: string;
    rate: string;
    offer_price: string;
  };
  setNewGradeForm: React.Dispatch<React.SetStateAction<{
    grade_name: string;
    purchase_price: string;
    rate: string;
    offer_price: string;
  }>>;
  handleCreateGrade: () => void;
  savingGrade: boolean;
  handleFormKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
}

export const CreateGradeModal: React.FC<CreateGradeModalProps> = ({
  isOpen,
  onClose,
  category,
  newGradeForm,
  setNewGradeForm,
  handleCreateGrade,
  savingGrade,
  handleFormKeyDown,
}) => {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Grade"
      className="max-w-lg backdrop-blur-none"
      closeButton={<RedCrossButton onClick={onClose} />}
    >
      <div className="space-y-3" onKeyDown={handleFormKeyDown} data-enter-nav>
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
                value={newGradeForm.grade_name}
                onChange={e => setNewGradeForm({ ...newGradeForm, grade_name: e.target.value })}
                className="w-full bg-background border border-border/80 rounded-xl p-3 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Purchase ({getCurrencyPrefix()})</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{getCurrencyPrefix()}</span>
                  <input
                    type="number" step="any"
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    placeholder="0.00"
                    value={newGradeForm.purchase_price}
                    onChange={e => setNewGradeForm({ ...newGradeForm, purchase_price: e.target.value })}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Base MRP ({getCurrencyPrefix()}/Kg)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{getCurrencyPrefix()}</span>
                  <input
                    type="number" step="any"
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    placeholder="0.00"
                    value={newGradeForm.rate}
                    onChange={e => setNewGradeForm({ ...newGradeForm, rate: e.target.value })}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Offer ({getCurrencyPrefix()})</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{getCurrencyPrefix()}</span>
                  <input
                    type="number" step="any"
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    placeholder="0.00"
                    value={newGradeForm.offer_price}
                    onChange={e => setNewGradeForm({ ...newGradeForm, offer_price: e.target.value })}
                    className="w-full bg-background border border-border/80 rounded-xl p-3 pl-8 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 focus:outline-none transition-all shadow-sm no-spinners text-sm font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            data-enter-submit
            onClick={handleCreateGrade}
            disabled={savingGrade || !newGradeForm.grade_name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/95 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-sm"
          >
            {savingGrade ? (
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
};
