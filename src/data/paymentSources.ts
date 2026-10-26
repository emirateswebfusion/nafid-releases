import { bindBridge } from './client';
import type { PaymentSourcesRow } from './dbRows';

/** A payment source as stored. Flag columns may hold booleans written by older terminals. */
export interface PaymentSource extends Omit<PaymentSourcesRow, 'is_default' | 'is_enabled'> {
  is_default: number | boolean | null;
  is_enabled: number | boolean | null;
}

/** Bank/UPI payment sources and their transactions. Channel catalog — the only way UI code reaches these IPC channels. */
export const paymentSourcesApi = bindBridge({
  getSources: 'dbPaymentGetSources',
  addSource: 'dbPaymentAddSource',
  updateSource: 'dbPaymentUpdateSource',
  deleteSource: 'dbPaymentDeleteSource',
  getTransactions: 'dbPaymentGetTransactions',
  addTransaction: 'dbPaymentAddTransaction',
});
