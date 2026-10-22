import { bindBridge } from './client';

/** Combo offers. Channel catalog — the only way UI code reaches these IPC channels. */
export const combosApi = bindBridge({
  getComboOffers: 'dbGetComboOffers',
  getComboOfferDetails: 'dbGetComboOfferDetails',
  saveComboOffer: 'dbSaveComboOffer',
  deleteComboOffer: 'dbDeleteComboOffer',
  toggleComboOfferActive: 'dbToggleComboOfferActive',
});
