import { bindBridge } from './client';
import type { ComboItemsRow, ComboOffersRow } from './dbRows';

/** A combo offer with its items, as `db:getComboOffers` returns it (items parsed from the aggregated JSON). */
export interface ComboOfferWithItems extends ComboOffersRow {
  items: ComboItemsRow[];
}

/** Combo offers. Channel catalog — the only way UI code reaches these IPC channels. */
export const combosApi = bindBridge({
  getComboOffers: 'dbGetComboOffers',
  getComboOfferDetails: 'dbGetComboOfferDetails',
  saveComboOffer: 'dbSaveComboOffer',
  deleteComboOffer: 'dbDeleteComboOffer',
  toggleComboOfferActive: 'dbToggleComboOfferActive',
});
