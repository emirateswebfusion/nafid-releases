import { ipcMain } from 'electron';
import { handle } from './common.js';
import * as recycleBinService from '../services/recycleBinService.js';
import * as settingsService from '../services/settingsService.js';
import * as invoicesService from '../services/invoicesService.js';
import * as staffService from '../services/staffService.js';

export function registerSettingsHandlers(): void {
  handle('emergency:purgeLocal', recycleBinService.emergencyPurge);

  handle('settings:getAll', settingsService.getAll);

  ipcMain.removeHandler('settings:get');
  handle('settings:get', settingsService.get);

  ipcMain.removeHandler('settings:set');
  handle('settings:set', settingsService.set);

  // db:getDeletedInvoices
  handle('db:getDeletedInvoices', recycleBinService.getDeletedInvoices);

  // db:restoreInvoice - reverses soft-delete and restores stock
  handle('db:restoreInvoice', recycleBinService.restoreInvoice);

  // db:getDeletedProducts
  handle('db:getDeletedProducts', recycleBinService.getDeletedProducts);

  // db:restoreProduct
  handle('db:restoreProduct', recycleBinService.restoreProduct);

  // db:getDeletedCustomers
  handle('db:getDeletedCustomers', recycleBinService.getDeletedCustomers);

  // db:restoreCustomer
  handle('db:restoreCustomer', recycleBinService.restoreCustomer);

  // db:getDeletedParties
  handle('db:getDeletedParties', recycleBinService.getDeletedParties);

  // db:hardDeleteInvoice - permanent delete (already soft-deleted)
  handle('db:hardDeleteInvoice', recycleBinService.hardDeleteInvoice);

  // db:hardDeleteProduct - permanent delete (already soft-deleted)
  handle('db:hardDeleteProduct', recycleBinService.hardDeleteProduct);

  // db:hardDeleteCustomer - permanent delete (already soft-deleted)
  handle('db:hardDeleteCustomer', recycleBinService.hardDeleteCustomer);

  // db:hardDeleteParty - permanent delete (already soft-deleted)
  handle('db:hardDeleteParty', recycleBinService.hardDeleteParty);

  // db:getRecycleBinSummary
  handle('db:getRecycleBinSummary', recycleBinService.getRecycleBinSummary);

  // db:emptyRecycleBin
  handle('db:emptyRecycleBin', recycleBinService.emptyRecycleBin);

  handle('db:deleteInvoice', invoicesService.deleteInvoice);

  handle('db:getStaff', staffService.getStaff, { safe: true });

  handle('db:saveStaff', staffService.saveStaff, { safe: true });

  handle('db:verifyBillerPin', staffService.verifyBillerPin, { safe: true });

  handle('db:getStaffLedger', staffService.getStaffLedger, { safe: true });

  handle('db:addStaffTransaction', staffService.addStaffTransaction, { safe: true });

  handle('db:getStaffAttendance', staffService.getStaffAttendance, { safe: true });

  handle('db:saveStaffAttendance', staffService.saveStaffAttendance, { safe: true });

}
