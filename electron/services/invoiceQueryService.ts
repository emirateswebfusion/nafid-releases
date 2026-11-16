import { getDb } from '../db/localDb.js';
import { getGuaranteedNextInvoiceNumber, peekGuaranteedNextInvoiceNumber, requestServerInvoiceNumber } from './invoiceNumberService.js';
import { localDate, parseCleanDate, getUtcRangeForStoreDateRange } from './storeTime.js';
import * as invoicesSql from '../db/statements/invoices.js';
import { resolveItemConstituents } from '../utils/comboTaxHelper.js';
/** Invoice read models: lists, summaries, dashboard stats, items, numbering previews. Called by electron/ipc handlers via invoicesService. */

function readFilingVisibility(db: Parameters<typeof invoicesSql.findSettingsByKey>[0], tenantId: string): { showB2b: boolean; showB2c: boolean } {
  const row = invoicesSql.findSettingsByKey(db).get(tenantId, 'filing_only_mode') as { value?: string } | undefined;
  try {
    const parsed = JSON.parse(row?.value || '{}');
    return {
      showB2b: parsed.showB2bInSalesCategory !== false && parsed.showB2bInSalesCategory !== 'false',
      showB2c: parsed.showB2cInSalesCategory !== false && parsed.showB2cInSalesCategory !== 'false',
    };
  } catch {
    return { showB2b: true, showB2c: true };
  }
}

/** IPC `db:getInvoices` */
export function getInvoices(filters?: { revenue_only?: boolean; user_id?: string; tenant_id?: string; role?: string; limit?: number; offset?: number; search?: string; payment_method?: string; invoice_type?: string; filterDate?: string; filterDateEnd?: string; tax_rate_percent?: string; only_user_invoices?: boolean; accounting_view?: 'REAL_SALES' | 'TAX_FILING' | 'ALL'; invoice_id?: string }) {
  try {
    const db = getDb();
    const { user_id, tenant_id, limit, offset, search, payment_method, invoice_type, filterDate, filterDateEnd, tax_rate_percent, accounting_view, invoice_id } = filters || {};

    const activeTenantId = tenant_id || 'global';

    // Direct invoice_id or invoice_number lookup shortcut
    if (invoice_id) {
      const direct = invoicesSql.findOneInvoiceItemByInvoiceId(db).all(invoice_id, invoice_id);
      if (direct && direct.length > 0) {
        return direct;
      }
    }

    const dateRange = filterDate
      ? getUtcRangeForStoreDateRange(parseCleanDate(filterDate), filterDateEnd ? parseCleanDate(filterDateEnd) : parseCleanDate(filterDate), activeTenantId)
      : null;
    const filingVisibility = readFilingVisibility(db, activeTenantId);
    const { statement, params } = invoicesSql.getInvoicesStatement(db, { activeTenantId, onlyUserInvoices: Boolean(filters?.only_user_invoices), user_id, search, payment_method, invoice_type, tax_rate_percent, accounting_view, invoice_id, limit, offset, dateRange, revenue_only: filters?.revenue_only, showFilingB2b: filingVisibility.showB2b, showFilingB2c: filingVisibility.showB2c });
    const results = statement.all(...params);
    console.log(`[db:getInvoices] Returned ${results.length} invoices for tenant_id=${tenant_id} filterDate=${filterDate||'any'} offset=${offset||0}`);
    return results;
  } catch (error) {
    console.error('[db:getInvoices] Error fetching invoices:', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getInvoicesSummary` */
export function getInvoicesSummary(filters?: { user_id?: string; tenant_id?: string; role?: string; search?: string; payment_method?: string; invoice_type?: string; filterDate?: string; filterDateEnd?: string; tax_rate_percent?: string; only_user_invoices?: boolean; accounting_view?: 'REAL_SALES' | 'TAX_FILING' | 'ALL' }) {
  try {
    const db = getDb();
    const { user_id, tenant_id, search, payment_method, invoice_type, filterDate, filterDateEnd, tax_rate_percent, accounting_view } = filters || {};

    const activeTenantId = tenant_id || 'global';

    const dateRange = filterDate
      ? getUtcRangeForStoreDateRange(parseCleanDate(filterDate), filterDateEnd ? parseCleanDate(filterDateEnd) : parseCleanDate(filterDate), activeTenantId)
      : null;
    const filingVisibility = readFilingVisibility(db, activeTenantId);
    const { statement, listedStatement, params } = invoicesSql.getInvoicesSummaryStatement(db, { activeTenantId, onlyUserInvoices: Boolean(filters?.only_user_invoices), user_id, search, payment_method, invoice_type, tax_rate_percent, accounting_view, dateRange, showFilingB2b: filingVisibility.showB2b, showFilingB2c: filingVisibility.showB2c });
    const isTaxFilingOrFilingOnly = accounting_view === 'TAX_FILING' || invoice_type === 'FILING_ONLY' || invoice_type === 'CONVERTED_GST';
    const activeStmt = isTaxFilingOrFilingOnly ? listedStatement : statement;
    const row = activeStmt.get(...params) as Record<string, number>;
    const totalSales = row ? Number(row.totalSales) || 0 : 0;
    const totalSalesBeforeDeductions = row ? Number(row.totalSalesBeforeDeductions) || 0 : 0;
    const totalInvoices = row ? Number(row.totalInvoices) || 0 : 0;
    const totalTax = row ? Number(row.totalTax) || 0 : 0;
    const totalDiscount = row ? Number(row.totalDiscount ?? row.discount_total) || 0 : 0;
    const totalScrap = row ? Number(row.totalScrap) || 0 : 0;
    const totalReturn = row ? Number(row.totalReturn) || 0 : 0;
    const avgOrder = totalInvoices > 0 ? totalSales / totalInvoices : 0;
    const listedInvoices = Number((listedStatement.get(...params) as Record<string, number> | undefined)?.totalInvoices) || 0;

    return { totalSales, totalSalesBeforeDeductions, totalInvoices, listedInvoices, totalTax, totalDiscount, totalScrap, totalReturn, avgOrder };
  } catch (error) {
    console.error('[db:getInvoicesSummary] Error:', error);
    return { totalSales: 0, totalSalesBeforeDeductions: 0, totalInvoices: 0, totalTax: 0, totalDiscount: 0, totalScrap: 0, totalReturn: 0, avgOrder: 0 };
  }
}

/** IPC `db:getDashboardStats` */
export function getDashboardStats(tenantId: string) {
  try {
    const db = getDb();
    const dateStr = localDate(new Date(), tenantId);
    const { startUtc, endUtc } = getUtcRangeForStoreDateRange(dateStr, dateStr, tenantId);
    const row = invoicesSql.findInvoicesByConvertedFrom_(db).get(tenantId, startUtc, endUtc) as Record<string, number>;
    return {
      success: true,
      totalSales: row.totalSales,
      totalSalesBeforeDeductions: row.totalSalesBeforeDeductions ?? row.totalSales,
      invoiceCount: row.invoiceCount,
    };
  } catch (error) {
    console.error('[db:getDashboardStats]', error);
    return { success: false, totalSales: 0, totalSalesBeforeDeductions: 0, invoiceCount: 0, error: 'Operation failed' };
  }
}

/** IPC `db:getInvoiceItems` */
export function getInvoiceItems(invoice_id: string) {
  try {
    const db = getDb();
    const rows = invoicesSql.findInvoiceItemsByInvoiceId2(db).all(invoice_id) as Array<Record<string, unknown>>;
    return rows.map(row => {
      const isCombo = Boolean(row.combo_id || (row.combo_details && row.combo_details !== 'null'));
      if (isCombo) {
        const constituents = resolveItemConstituents(db, row as { combo_id?: string | null; combo_details?: string | null; product_id: string });
        if (constituents.length > 0) {
          return {
            ...row,
            combo_details: JSON.stringify(constituents),
          };
        }
      }
      return row;
    });
  } catch (error) {
    console.error('[db:getInvoiceItems]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getBosConvertibleInvoices` */
export function getBosConvertibleInvoices(tenantId: string, invoiceIds?: string[]) {
  try {
    const db = getDb();
    if (!tenantId) return [];
    if (invoiceIds !== undefined && (!Array.isArray(invoiceIds) || invoiceIds.length === 0 || invoiceIds.some(id => typeof id !== 'string'))) return [];
    return invoicesSql.findInvoiceItemsByInvoiceIdAndIsGstApplicable(db, invoiceIds).all(tenantId, tenantId, ...(invoiceIds || []));
  } catch (error) {
    console.error('[db:getBosConvertibleInvoices]', error);
    return [];
  }
}

/** IPC `db:getNextServerInvoiceNumber` */
export async function getNextServerInvoiceNumber({ tenant_id, series, start }: { tenant_id: string; series?: string; start?: number }) {
  try {
    const db = getDb();
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
    return await requestServerInvoiceNumber(db, tenant_id || 'global', series, configKey, start);
  } catch (error) {
    console.error('[db:getNextServerInvoiceNumber]', error);
    return { success: false, error: 'Operation failed', offline: true };
  }
}

/** IPC `db:getNextInvoiceNumber` */
export function getNextInvoiceNumber({ tenant_id, series }: { tenant_id: string; series?: string }) {
  try {
    const db = getDb();
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
    const result = getGuaranteedNextInvoiceNumber(db, tenant_id || 'global', configKey);
    return { success: true, invoiceNumber: result.invoiceNumber, counter: result.counter };
  } catch (error) {
    console.error('[db:getNextInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:peekNextInvoiceNumber` */
export function peekNextInvoiceNumber({ tenant_id, series }: { tenant_id: string; series?: string }) {
  try {
    const db = getDb();
    const configKey = series === 'gst_b2b' ? 'gst_b2b_invoice_counter_config' : series === 'gst_b2c' ? 'gst_b2c_invoice_counter_config' : series === 'gst' ? 'gst_invoice_counter_config' : 'invoice_counter_config';
    const result = peekGuaranteedNextInvoiceNumber(db, tenant_id || 'global', configKey);
    return { success: true, invoiceNumber: result.invoiceNumber, counter: result.counter, prefix: result.prefix };
  } catch (error) {
    console.error('[db:peekNextInvoiceNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
}
