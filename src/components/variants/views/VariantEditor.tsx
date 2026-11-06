import { Layers, Loader2, Save } from 'lucide-react';
import type { Product } from '../../../data/products';
import { useCloseOnEscape } from '../../../hooks/useCloseOnEscape';
import { variantParentForm } from '../../inventory/variantDrafts';
import { VariantsSection } from '../../inventory/views/form/VariantsSection';
import { Button } from '../../ui/Button';
import { RedCrossButton } from '../../ui/RedCrossButton';
import { Modal } from '../../ui/Modal';
import { useVariantEditor } from '../hooks/useVariantEditor';

/** Writes only the selected child; parent and sibling inventory are never saved here. */
export function VariantEditor({ parent, product, tenantId, onClose, onSaved }: {
  parent: Product; product?: Product; tenantId: string; onClose: () => void; onSaved: () => void;
}) {
  const { variants, setVariants, tiers, paper, loading, busy, error, canSave, retry, save } = useVariantEditor(parent, product, tenantId, onSaved);
  const form = variantParentForm(parent);
  const close = () => { if (!busy) onClose(); };
  useCloseOnEscape(busy ? null : onClose);
  return <Modal isOpen fullScreen title={null} onClose={close} overlayClassName="p-0" contentClassName="flex flex-col">
    <div role="dialog" aria-modal="true" aria-labelledby="variant-editor-title" className="flex flex-1 min-h-0 flex-col bg-background">
    <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6 py-3">
      <div className="flex items-center gap-3 min-w-0"><div className="p-2 rounded-xl bg-primary/10 text-primary"><Layers className="w-5 h-5" /></div>
        <div className="min-w-0"><h1 id="variant-editor-title" className="text-base font-bold">{product ? 'Edit Variant' : 'Add Variant'}</h1><p className="text-xs text-muted-foreground truncate">{parent.name}</p></div></div>
      <RedCrossButton onClick={close} title="Close variant editor" />
    </header>
    <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 space-y-3">
      {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 text-destructive p-3 text-sm">{error}
        {!variants.length && <Button variant="outline" className="ml-3" onClick={retry}>Retry</Button>}</div>}
      {loading ? <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" />Loading variant…</div> :
        <fieldset disabled={busy} className="min-w-0"><VariantsSection variants={variants} setVariants={setVariants} formData={form} activePricingTiers={tiers} enableRealPaperStock={paper} singleVariant /></fieldset>}
    </div>
    <footer className="flex justify-end gap-2 border-t border-border bg-card px-4 sm:px-6 py-3">
      <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button disabled={busy || loading || !variants.length || !canSave} onClick={() => void save()}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}{busy ? 'Saving…' : 'Save Variant'}</Button>
    </footer>
  </div></Modal>;
}
