import { bindBridge } from './client';
import type { ReturnsRow } from './dbRows';

/** Row returned by `returnsService.getReturnInvoiceByNumber` (`SELECT * FROM returns`). */
export type ReturnInvoiceByNumber = ReturnsRow;

/** Exact-match, no-match and prefix-search return shapes from `returnsService.getReturnInvoiceByNumber`. */
export type ReturnInvoiceByNumberResult = ReturnInvoiceByNumber | null;

/** Sales returns and return numbering. Channel catalog — the only way UI code reaches these IPC channels. */
export const returnsApi = bindBridge({
  createReturn: 'dbCreateReturn',
  getReturns: 'dbGetReturns',
  getReturnItems: 'dbGetReturnItems',
  deleteReturn: 'dbDeleteReturn',
  getNextReturnNumber: 'dbGetNextReturnNumber',
  peekNextReturnNumber: 'dbPeekNextReturnNumber',
  getAlreadyReturnedQuantities: 'dbGetAlreadyReturnedQuantities',
  getReturnableInvoices: 'dbGetReturnableInvoices',
  getReturnInvoiceByNumber: 'dbGetReturnInvoiceByNumber',
  getPendingReturnInvoices: 'dbGetPendingReturnInvoices',
  settleReturnInvoice: 'dbSettleReturnInvoice',
});
