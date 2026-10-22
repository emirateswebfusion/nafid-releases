import { handle } from './common.js';
import * as scrapService from '../services/scrapService.js';
import * as productsService from '../services/productsService.js';
import * as purchasesService from '../services/purchasesService.js';
import * as invoicesService from '../services/invoicesService.js';

export function registerPurchaseScrapHandlers(): void {
  // ── Scrap Categories IPC (categories ARE items, with price/stock/unit) ──
  handle('db:getScrapCategories', scrapService.getScrapCategories);

  handle('db:addScrapCategory', scrapService.addScrapCategory);

  handle('db:updateScrapCategory', scrapService.updateScrapCategory);

  handle('db:deleteScrapCategory', scrapService.deleteScrapCategory);

  handle('db:deduplicateScrapCategories', scrapService.deduplicateScrapCategories);

  handle('db:addScrapTransaction', scrapService.addScrapTransaction, { safe: true });

  handle('db:getScrapTransactions', scrapService.getScrapTransactions);

  handle('db:getScrapCategoriesBySearch', scrapService.getScrapCategoriesBySearch);

  handle('db:getNextScrapInvoiceNumber', scrapService.getNextScrapInvoiceNumber);

  handle('db:peekNextScrapInvoiceNumber', scrapService.peekNextScrapInvoiceNumber);
  handle('db:getScrapInvoiceByNumber', scrapService.getScrapInvoiceByNumber);

  handle('db:getScrapInvoiceList', scrapService.getScrapInvoiceList);

  handle('db:updateScrapInvoicePaymentStatus', scrapService.updateScrapInvoicePaymentStatus);

  handle('db:updateScrapInvoiceHeader', scrapService.updateScrapInvoiceHeader);

  handle('db:updateScrapInvoiceFull', scrapService.updateScrapInvoiceFull);

  handle('db:updateScrapTransaction', scrapService.updateScrapTransaction, { safe: true });

  handle('db:deleteScrapTransaction', scrapService.deleteScrapTransaction);

  handle('db:deleteScrapInvoice', scrapService.deleteScrapInvoice);

  // ── Scrap CREDIT → Party/Ledger ──────────────────────────────────────────
  // Creates/updates a party ledger entry for a CREDIT scrap invoice (idempotent
  // per invoice via reference_number). Non-CREDIT status removes the entry.
  handle('db:upsertScrapCreditLedger', scrapService.upsertScrapCreditLedger, { safe: true });

  handle('db:getStockReport', productsService.getStockReport);

  handle('db:getProductBillQuantities', productsService.getProductBillQuantities);

  handle('db:getProductSuppliers', purchasesService.getProductSuppliers);

  // ── Product Sales Summary (GST qty vs BoS qty sold per product) ─────────────
  handle('db:getProductSalesSummary', productsService.getProductSalesSummary);

  // ── BoS convertible check: which BoS invoices have ≥1 item with a GST purchase record ──
  handle('db:getBosConvertibleInvoices', invoicesService.getBosConvertibleInvoices);

  handle('db:peekNextPurchaseBillNumber', purchasesService.peekNextPurchaseBillNumber);

  handle('db:getNextPurchaseBillNumber', purchasesService.getNextPurchaseBillNumber);

  handle('db:addPurchaseBill', purchasesService.addPurchaseBill, { safe: true });

  handle('db:getPurchaseBills', purchasesService.getPurchaseBills);

  handle('db:getPurchaseBillItems', purchasesService.getPurchaseBillItems);

  handle('db:updatePurchaseBill', purchasesService.updatePurchaseBill, { safe: true });

  handle('db:deletePurchaseBill', purchasesService.deletePurchaseBill);

  handle('db:productHasEstimateBills', productsService.productHasEstimateBills);

  handle('db:getPurchaseBillProducts', purchasesService.getPurchaseBillProducts);

  handle('db:generateBarcode', productsService.generateBarcode);

  // ── Cash Drawer Helpers ───────────────────────────────────────────────────────

}
