import { bindBridge } from './client';

/** Bank/UPI payment sources and their transactions. Channel catalog — the only way UI code reaches these IPC channels. */
export const paymentSourcesApi = bindBridge({
  getSources: 'dbPaymentGetSources',
  addSource: 'dbPaymentAddSource',
  updateSource: 'dbPaymentUpdateSource',
  deleteSource: 'dbPaymentDeleteSource',
  getTransactions: 'dbPaymentGetTransactions',
  addTransaction: 'dbPaymentAddTransaction',
});
