import { create } from 'zustand';
import type { DraftLine } from '../data/restaurant';

/**
 * Items added to restaurant orders but not yet sent to the kitchen, per order id, and runtime billed
 * status (guest check printed). Kept for the app session (not on disk), so a waiter who leaves the
 * order, switches screens or opens Billing comes back to the same unsent items and table state.
 */
interface RestaurantDraftState {
  drafts: Record<string, DraftLine[]>;
  billedOrderIds: Record<string, boolean>;
  update: (orderId: string, fn: (prev: DraftLine[]) => DraftLine[]) => void;
  markBilled: (orderId: string) => void;
  clearBilled: (orderId: string) => void;
}

export const useRestaurantDraftStore = create<RestaurantDraftState>()((set) => ({
  drafts: {},
  billedOrderIds: {},
  update: (orderId, fn) => set(state => {
    const next = fn(state.drafts[orderId] ?? []);
    const drafts = { ...state.drafts };
    if (next.length > 0) drafts[orderId] = next; else delete drafts[orderId];
    return { drafts };
  }),
  markBilled: (orderId) => set(state => ({
    billedOrderIds: { ...state.billedOrderIds, [orderId]: true },
  })),
  clearBilled: (orderId) => set(state => {
    if (!state.billedOrderIds[orderId]) return state;
    const billedOrderIds = { ...state.billedOrderIds };
    delete billedOrderIds[orderId];
    return { billedOrderIds };
  }),
}));
