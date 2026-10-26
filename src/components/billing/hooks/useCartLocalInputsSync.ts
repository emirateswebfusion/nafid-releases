import React, { useEffect } from 'react';
import type { CartItem } from '../../../store/cartStore';

export interface UseCartLocalInputsSyncContext {
  items: CartItem[];
  setLocalDiscFlats: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setLocalDiscPcts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setLocalKgStr: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setLocalPcsStr: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

/** Keeps the per-line local discount / quantity input state in step with the cart items (adds new lines, drops removed ones). */
export function useCartLocalInputsSync(ctx: UseCartLocalInputsSyncContext) {
  const { items, setLocalDiscFlats, setLocalDiscPcts, setLocalKgStr, setLocalPcsStr } = ctx;
  // Sync local discount + pcs/kg state when items are added/removed
  useEffect(() => {
    const ids = new Set(items.map(i => i.product_id));

    setLocalDiscPcts(prev => {
      const next = { ...prev };
      let changed = false;
      items.forEach(item => {
        if (!(item.product_id in prev)) { next[item.product_id] = item.discount_percent ?? 0; changed = true; }
      });
      Object.keys(next).forEach(id => { if (!ids.has(id)) { delete next[id]; changed = true; } });
      return changed ? next : prev;
    });
    setLocalDiscFlats(prev => {
      const next = { ...prev };
      let changed = false;
      items.forEach(item => {
        if (!(item.product_id in prev)) { next[item.product_id] = item.discount_flat ?? 0; changed = true; }
      });
      Object.keys(next).forEach(id => { if (!ids.has(id)) { delete next[id]; changed = true; } });
      return changed ? next : prev;
    });
    // Pcs/Kg local strings: initialise for new items, clean up removed items.
    // Do NOT overwrite if the user is mid-edit (key already present).
    const weightUoms = ['Kgs', 'Grams', 'Mtrs', 'Ltrs', 'kg', 'kgs', 'gram', 'grams', 'mtr', 'mtrs', 'ltr', 'ltrs'];
    setLocalPcsStr(prev => {
      const next = { ...prev };
      let changed = false;
      items.forEach(item => {
        const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
        if (isPiecesWeight) {
          const numPcs = item.pieces_override ?? 1;
          const curNum = parseInt(prev[item.product_id] || '', 10);
          if (!(item.product_id in prev) || (item.pieces_override !== undefined && prev[item.product_id] !== '' && !isNaN(curNum) && curNum !== numPcs)) {
            next[item.product_id] = String(numPcs);
            changed = true;
          }
        }
      });
      Object.keys(next).forEach(id => { if (!ids.has(id)) { delete next[id]; changed = true; } });
      return changed ? next : prev;
    });
    setLocalKgStr(prev => {
      const next = { ...prev };
      let changed = false;
      items.forEach(item => {
        const isPiecesWeight = item.billing_type === 'WEIGHT' || weightUoms.includes((item.uom || '').toLowerCase());
        if (isPiecesWeight) {
          const numKg = Number(item.quantity);
          const curNum = parseFloat(prev[item.product_id] || '');
          if (!(item.product_id in prev) || (item.quantity !== undefined && prev[item.product_id] !== '' && !isNaN(curNum) && curNum !== numKg)) {
            next[item.product_id] = String(item.quantity ?? '');
            changed = true;
          }
        }
      });
      Object.keys(next).forEach(id => { if (!ids.has(id)) { delete next[id]; changed = true; } });
      return changed ? next : prev;
    });
  }, [items, setLocalDiscFlats, setLocalDiscPcts, setLocalKgStr, setLocalPcsStr]);

}
