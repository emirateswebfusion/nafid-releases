import { bindBridge } from './client';
import type { ComboItemsRow, ComboOffersRow } from './dbRows';

/** A combo offer with its items, as `db:getComboOffers` returns it (items parsed from the aggregated JSON). */
export interface ComboOfferWithItems extends ComboOffersRow {
  items: ComboOfferListItem[];
}

/** Item shape from `getComboOffersStatement`'s JSON aggregation (product columns come from its inner join). */
export interface ComboOfferListItem {
  combo_item_id: string;
  product_id: string;
  quantity: number;
  product_name: string;
  product_price: number;
  product_stock: number | null;
  sku_barcode: string | null;
  uom: string | null;
}

/** Joined item row returned by `combosService.getComboOfferDetails` / `findComboItemsByComboId`. */
export interface ComboItemWithProduct extends ComboItemsRow {
  product_name: string;
  product_price: number;
  product_stock: number | null;
  sku_barcode: string | null;
  uom: string | null;
}

/** Offer detail returned by `combosService.getComboOfferDetails`; invalid, missing or failed lookups return null. */
export interface ComboOfferDetails extends ComboOffersRow {
  items: ComboItemWithProduct[];
}

/** Combo offers. Channel catalog — the only way UI code reaches these IPC channels. */
export const combosApi = bindBridge({
  getComboOffers: 'dbGetComboOffers',
  getComboOfferDetails: 'dbGetComboOfferDetails',
  saveComboOffer: 'dbSaveComboOffer',
  deleteComboOffer: 'dbDeleteComboOffer',
  toggleComboOfferActive: 'dbToggleComboOfferActive',
});
