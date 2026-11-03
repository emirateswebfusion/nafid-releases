import { create } from 'zustand';
import type { DraftLine } from '../data/restaurant';

/**
 * Items added to restaurant orders but not yet sent to the kitchen, per order id. Kept for the app session (not on
 * disk), so a waiter who leaves the order, switches screens or opens Billing comes back to the same unsent items.
 */
interface RestaurantDraftState {
  drafts: Record<string, DraftLine[]>;
  update: (orderId: string, fn: (prev: DraftLine[]) => DraftLine[]) => void;
}

export const useRestaurantDraftStore = create<RestaurantDraftState>()((set) => ({
  drafts: {},
  update: (orderId, fn) => set(state => {
    const next = fn(state.drafts[orderId] ?? []);
    const drafts = { ...state.drafts };
    if (next.length > 0) drafts[orderId] = next; else delete drafts[orderId];
    return { drafts };
  }),
}));
