import { cashierApi } from '../../data/cashier';
import { hasBridge } from '../../data/client';
import { invoicesApi } from '../../data/invoices';
import { partiesApi } from '../../data/parties';
import { productsApi } from '../../data/products';
import { purchasesApi } from '../../data/purchases';
import { returnsApi } from '../../data/returns';
import type { AiHistoryMessage, AiRow } from './types';

/** Returned by a handler when the intent is not one of its own, so the next handler is tried. */
export const NOT_HANDLED = Symbol('offline-ai-not-handled');

/** Per-question context shared by the handlers: the question, the language and the safe data fetchers. */
export function createAiQueryContext(queryText: string, tenantId: string, history: AiHistoryMessage[], isMal: boolean) {
  // Helper to fetch filtered invoices with safe fallback
  const fetchInvoices = async (fromDate: string, toDate: string): Promise<AiRow[]> => {
    try {
      const invs = await invoicesApi.getInvoices({
        tenant_id: tenantId,
        revenue_only: true,
        filterDate: fromDate,
        filterDateEnd: toDate,
      });
      if (!Array.isArray(invs)) throw new Error('Invoice records could not be read.');
      return invs;
    } catch (err) {
      console.warn('[OfflineAiService] dbGetInvoices failed:', err);
      throw err;
    }
  };

  // Helper to get aggregated summary
  const fetchSummary = async (fromDate: string, toDate: string) => {
    if (hasBridge('dbGetInvoicesSummary')) {
      try {
        const res = await invoicesApi.getInvoicesSummary({
          tenant_id: tenantId,
          revenue_only: true,
        filterDate: fromDate,
          filterDateEnd: toDate,
        });
        if (res && typeof res.totalSales === 'number') {
          return res;
        }
      } catch (err) {
        console.warn('[OfflineAiService] dbGetInvoicesSummary failed:', err);
      }
    }

    const invs = await fetchInvoices(fromDate, toDate);
    const validInvs = invs.filter((i: AiRow) => !i.converted_to_invoice_id && !['HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'].includes(i.invoice_type as string));
    const totalSales = validInvs.reduce((acc: number, inv: AiRow) => acc + (Number(inv.grand_total) || 0), 0);
    const totalInvoices = validInvs.length;
    const totalTax = validInvs.reduce((acc: number, inv: AiRow) => acc + (Number(inv.tax_total) || 0), 0);
    const totalDiscount = validInvs.reduce((acc: number, inv: AiRow) => acc + (Number(inv.discount_total) || 0) + (Number(inv.points_redeemed_discount) || 0), 0);
    const avgOrder = totalInvoices > 0 ? totalSales / totalInvoices : 0;
    return { totalSales, totalInvoices, totalTax, totalDiscount, avgOrder };
  };

  // Safe fetch helper for cash transactions
  const fetchCashTransactions = async (fromDate?: string, toDate?: string): Promise<AiRow[]> => {
    try {
      if (hasBridge('dbCashierGetDayTransactions')) {
        const res = await cashierApi.getDayTransactions({
          tenant_id: tenantId,
          from_date: fromDate,
          to_date: toDate,
        });
        if (!Array.isArray(res)) throw new Error('Cash transactions could not be read');
        return res;
      }
      if (hasBridge('dbCashierGetTransactions')) {
        const res = await cashierApi.getTransactions({ tenant_id: tenantId });
        if (Array.isArray(res)) return res;
      }
      throw new Error('Local data reader is unavailable');
    } catch (err) {
      console.warn('[OfflineAiService] fetchCashTransactions failed:', err);
      throw err;
    }
  };

  // Safe fetch helper for products
  const fetchProducts = async (): Promise<AiRow[]> => {
    try {
      if (hasBridge('dbGetProducts')) {
        const res = await productsApi.getProducts({ tenant_id: tenantId });
        if (!Array.isArray(res)) throw new Error('Local records could not be read');
        return res;
      }
      throw new Error('Local data reader is unavailable');
    } catch (err) {
      console.warn('[OfflineAiService] fetchProducts failed:', err);
      throw err;
    }
  };

  // Safe fetch helper for purchase bills
  const fetchPurchaseBills = async (search?: string): Promise<AiRow[]> => {
    try {
      if (hasBridge('dbGetPurchaseBills')) {
        const res = await purchasesApi.getPurchaseBills({ tenant_id: tenantId, search });
        if (!Array.isArray(res)) throw new Error('Local records could not be read');
        return res;
      }
      throw new Error('Local data reader is unavailable');
    } catch (err) {
      console.warn('[OfflineAiService] fetchPurchaseBills failed:', err);
      throw err;
    }
  };

  // Safe fetch helper for parties
  const fetchParties = async (): Promise<AiRow[]> => {
    try {
      if (hasBridge('dbGetParties')) {
        const res = await partiesApi.getParties(tenantId);
        if (!Array.isArray(res)) throw new Error('Local records could not be read');
        return res;
      }
      throw new Error('Local data reader is unavailable');
    } catch (err) {
      console.warn('[OfflineAiService] fetchParties failed:', err);
      throw err;
    }
  };

  // Safe fetch helper for returns
  const fetchReturns = async (): Promise<AiRow[]> => {
    try {
      if (hasBridge('dbGetReturns')) {
        const res = await returnsApi.getReturns({ tenant_id: tenantId });
        if (!Array.isArray(res)) throw new Error('Local records could not be read');
        return res;
      }
      throw new Error('Local data reader is unavailable');
    } catch (err) {
      console.warn('[OfflineAiService] fetchReturns failed:', err);
      throw err;
    }
  };

  // Safe fetch helper for cash drawer
  const fetchCashDrawer = async (bDate?: string): Promise<Partial<AiRow> | null> => {
    try {
      if (hasBridge('dbCashierGetDrawer')) {
        const res = await cashierApi.getDrawer({ tenant_id: tenantId, business_date: bDate });
        if (res && 'error' in res) throw new Error(res.error);
        return res as unknown as Partial<AiRow> | null;
      }
      throw new Error('Drawer reader is unavailable');
    } catch (err) {
      console.warn('[OfflineAiService] fetchCashDrawer failed:', err);
      throw err;
    }
  };

  return {
    queryText, tenantId, history, isMal,
    fetchInvoices, fetchSummary, fetchCashTransactions, fetchProducts, fetchPurchaseBills, fetchParties, fetchReturns,
    fetchCashDrawer,
  };
}

export type AiQueryContext = ReturnType<typeof createAiQueryContext>;
