import { bindBridge } from './client';

/** Quotations and their numbering. Channel catalog — the only way UI code reaches these IPC channels. */
export const quotationsApi = bindBridge({
  getNextQuotationNumber: 'dbGetNextQuotationNumber',
  peekNextQuotationNumber: 'dbPeekNextQuotationNumber',
  saveQuotation: 'dbSaveQuotation',
  getQuotations: 'dbGetQuotations',
  getQuotationItems: 'dbGetQuotationItems',
  updateQuotationStatus: 'dbUpdateQuotationStatus',
  deleteQuotation: 'dbDeleteQuotation',
  updateQuotation: 'dbUpdateQuotation',
});
