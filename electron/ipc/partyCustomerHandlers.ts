
import { handle } from './common.js';
import * as partiesService from '../services/partiesService.js';
import * as customersService from '../services/customersService.js';

export function registerPartyCustomerHandlers(): void {
  handle('db:getParties', partiesService.getParties);

  handle('db:addParty', partiesService.addParty, { safe: true });

  handle('db:bulkImportParties', partiesService.bulkImportParties, { safe: true });

  handle('db:updateParty', partiesService.updateParty, { safe: true });

  handle('db:deleteParty', partiesService.deleteParty);

  handle('db:restoreParty', partiesService.restoreParty);

  handle('db:adjustPartyBalance', partiesService.adjustPartyBalance);

  handle('db:mergeParties', partiesService.mergeParties, { safe: true });

  handle('db:getPartyLedger', partiesService.getPartyLedger);

  handle('db:restorePartyLedgerEntry', partiesService.restorePartyLedgerEntry);

  handle('db:addPartyLedgerEntry', partiesService.addPartyLedgerEntry, { safe: true });

  handle('db:updatePartyLedgerEntry', partiesService.updatePartyLedgerEntry);

  handle('db:deletePartyLedgerEntry', partiesService.deletePartyLedgerEntry);

  // ── Helper: Compute customer credit status & FIFO allocations ──

  // ── Customer / Loyalty Points IPC Handlers ──

  handle('db:getCustomers', customersService.getCustomers);

  handle('db:checkCustomerCreditStatus', customersService.checkCustomerCreditStatus);

  handle('db:createCustomer', customersService.createCustomer);

  handle('db:deduplicateCustomers', customersService.deduplicateCustomers);

  handle('db:findCustomers', customersService.findCustomers);

  handle('db:deleteCustomer', customersService.deleteCustomer);

  handle('db:updateCustomer', customersService.updateCustomer);

  handle('db:getCustomerInvoices', customersService.getCustomerInvoices);

  handle('db:getCustomerLoyaltyTransactions', customersService.getCustomerLoyaltyTransactions);

  handle('db:adjustCustomerLoyaltyPoints', customersService.adjustCustomerLoyaltyPoints, { safe: true });

  handle('db:recalculateCustomerLoyaltyPoints', customersService.recalculateCustomerLoyaltyPoints, { safe: true });

  // ── Staff Management Handlers ──────────────────────────────────────────────

}
