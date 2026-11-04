import { handle } from './common.js';
import * as einvoiceService from '../services/einvoiceService.js';

export function registerEinvoiceHandlers(): void {
  handle('db:getEinvoiceStatuses', einvoiceService.getEinvoiceStatuses);
  handle('db:getEinvoiceSummary', einvoiceService.getEinvoiceSummary);
  handle('db:getCustomerEinvoiceProfile', einvoiceService.getCustomerEinvoiceProfile);
  handle('db:saveCustomerEinvoiceProfile', einvoiceService.saveCustomerEinvoiceProfile, { safe: true });
}
