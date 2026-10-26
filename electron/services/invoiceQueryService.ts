import { getDb } from '../db/localDb.js';
import { getGuaranteedNextInvoiceNumber, peekGuaranteedNextInvoiceNumber, requestServerInvoiceNumber } from './invoiceNumberService.js';
import { localDate, parseCleanDate, getUtcRangeForStoreDateRange } from './storeTime.js';
import * as invoicesSql from '../db/statements/invoices.js';
/** Invoice read models: lists, summaries, dashboard stats, items, numbering previews. Called by electron/ipc handlers via invoicesService. */

/** IPC `db:getInvoices` */
export function getInvoices(filters?: { user_id?: string; tenant_id?: string; role?: string; limit?: number; offset?: number; search?: string; payment_method?: string; invoice_type?: string; filterDate?: string; filterDateEnd?: string; tax_rate_percent?: string; only_user_invoices?: boolean; accounting_view?: 'REAL_SALES' | 'TAX_FILING' | 'ALL'; invoice_id?: string }) {
  try {
    const db = getDb();
    const { user_id, tenant_id, limit, offset, search, payment_method, invoice_type, filterDate, filterDateEnd, tax_rate_percent, accounting_view, invoice_id } = filters || {};

    const activeTenantId = tenant_id || 'global';

    let query = `
      SELECT i.*, u.name as biller_name,
        st_biller.name as biller_staff_name,
        st_sales.name as sales_staff_name,
        COALESCE((SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.invoice_id), 0) as item_count
      FROM invoices i 
      LEFT JOIN users u ON i.user_id = u.user_id 
      LEFT JOIN staff st_biller ON i.biller_staff_id = st_biller.staff_id
      LEFT JOIN staff st_sales ON i.sales_staff_id = st_sales.staff_id
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
    `;
    const params: any[] = [activeTenantId];

    // Direct invoice_id or invoice_number lookup shortcut
    if (invoice_id) {
      const direct = invoicesSql.findOneInvoiceItemByInvoiceId(db).all(invoice_id, invoice_id);
      if (direct && direct.length > 0) {
        return direct;
      }
    }

    // Only filter by user_id if explicitly requested (e.g. only_user_invoices flag)
    if (filters?.only_user_invoices && user_id) {
      query += ' AND i.user_id = ?';
      params.push(user_id);
    }

    // Accounting View filter:
    // - TAX_FILING: Official GST invoices meant for government/tax filing (both direct GST and BoS-converted GST copies)
    // - ALL: Complete unfiltered ledger (both original counter sales and GST filing copies)
    // - REAL_SALES: Bill of Supply (BOS) counter sales only. Strictly excludes GST (B2C and B2B) bills!
    if (invoice_id) {
      // If directly looking up an invoice by ID, do not restrict by accounting view
    } else if (accounting_view === 'TAX_FILING') {
      query += " AND i.invoice_type = 'GST'";
    } else if (accounting_view === 'REAL_SALES') {
      query += " AND i.invoice_type = 'BILL_OF_SUPPLY'";
    } else if (accounting_view === 'ALL') {
      // Do not filter out conversion copies for the full ledger. When a product-level
      // tax rate filter is active, the synthetic GST copies are excluded so the list
      // matches the de-duplicated summary and product totals.
      if (tax_rate_percent !== undefined && tax_rate_percent !== '' && tax_rate_percent !== 'all') {
        query += " AND (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '')";
      }
    } else {
      // Default to REAL_SALES: Show genuine counter transactions
      query += " AND (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '')";
    }

    if (search) {
      query += ' AND (i.invoice_id = ? OR i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ? OR i.description LIKE ? OR i.notes LIKE ?)';
      params.push(search, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (payment_method) {
      const pmUpper = payment_method.toUpperCase();
      if (['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'].includes(pmUpper)) {
        const jsonKey = pmUpper === 'BANK_TRANSFER' ? 'bank_transfer' : pmUpper.toLowerCase();
        query += ` AND (UPPER(i.payment_method) = ? OR (UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND CAST(json_extract(i.split_details, '$.${jsonKey}') AS REAL) > 0))`;
        params.push(pmUpper);
      } else {
        query += ' AND UPPER(i.payment_method) = ?';
        params.push(pmUpper);
      }
    }

    if (invoice_type === 'GST_B2B') {
      query += " AND i.invoice_type = 'GST' AND i.customer_gstin IS NOT NULL AND i.customer_gstin != ''";
    } else if (invoice_type === 'GST_B2C') {
      query += " AND i.invoice_type = 'GST' AND (i.customer_gstin IS NULL OR i.customer_gstin = '')";
    } else if (invoice_type === 'BILL_OF_SUPPLY') {
      query += " AND i.invoice_type = 'BILL_OF_SUPPLY'";
    } else if (invoice_type === 'GST') {
      query += " AND i.invoice_type = 'GST'";
    }

    if (tax_rate_percent !== undefined && tax_rate_percent !== '') {
      const targetRate = parseFloat(tax_rate_percent);
      if (!isNaN(targetRate)) {
        query += ` AND EXISTS (
          SELECT 1 FROM invoice_items ii
          WHERE ii.invoice_id = i.invoice_id
            AND (
              ROUND(COALESCE(ii.cgst_rate, 0) + COALESCE(ii.sgst_rate, 0) + COALESCE(ii.igst_rate, 0)) = ?
              OR (ii.total > 0 AND ROUND((ii.tax_amount / ii.total) * 100.0) = ?)
            )
        )`;
        params.push(targetRate, targetRate);
      }
    }

    if (filterDate) {
      const cleanStart = parseCleanDate(filterDate);
      const cleanEnd = filterDateEnd ? parseCleanDate(filterDateEnd) : cleanStart;
      const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, activeTenantId);

      // Use created_at for date filtering to match the grouping/ordering in the UI.
      // Using COALESCE(settled_at, created_at) caused invoices created on a different date
      // to appear under wrong date groups (e.g. filtered for Oct 12 but displayed under Oct 19).
      query += ` AND (i.created_at >= ? AND i.created_at <= ?)`;
      params.push(startUtc, endUtc);
    }

    query += ' ORDER BY i.created_at DESC, i.invoice_id ASC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    if (offset) {
      query += ' OFFSET ?';
      params.push(offset);
    }

    const results = db.prepare(query).all(...params);
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

    // Determine the split_details JSON key for the active payment method filter
    const splitJsonKey = payment_method && ['CASH','UPI','CARD','BANK_TRANSFER','CHEQUE','CREDIT'].includes(payment_method.toUpperCase())
      ? (payment_method.toUpperCase() === 'BANK_TRANSFER' ? 'bank_transfer' : payment_method.toLowerCase())
      : null;

    const isTaxFiling = accounting_view === 'TAX_FILING';
    const isBosOnly = accounting_view === 'REAL_SALES';

    let query = isTaxFiling ? `
      SELECT 
        COALESCE(SUM(
          CASE
            WHEN UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND i.split_details IS NOT NULL AND ${splitJsonKey ? `'${splitJsonKey}' IS NOT NULL` : `1=0`}
              THEN CAST(COALESCE(json_extract(i.split_details, '$.${splitJsonKey || 'cash'}'), 0) AS REAL)
            ELSE MAX(0, COALESCE(i.grand_total, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0) - COALESCE(i.scrap_deduction, 0) - COALESCE(i.return_deduction, 0)))
          END
        ), 0) as totalSales,
        COALESCE(SUM(MAX(0, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0))), 0) as totalSalesBeforeDeductions,
        COUNT(1) as totalInvoices,
        COALESCE(SUM(i.tax_total), 0) as totalTax,
        COALESCE(SUM(i.discount_total), 0) as totalDiscount
      FROM invoices i 
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type = 'GST')
        AND (i.is_held IS NULL OR i.is_held = 0)
    ` : isBosOnly ? `
      SELECT 
        COALESCE(SUM(
          CASE
            WHEN UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND i.split_details IS NOT NULL AND ${splitJsonKey ? `'${splitJsonKey}' IS NOT NULL` : `1=0`}
              THEN CAST(COALESCE(json_extract(i.split_details, '$.${splitJsonKey || 'cash'}'), 0) AS REAL)
            ELSE MAX(0, COALESCE(i.grand_total, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0) - COALESCE(i.scrap_deduction, 0) - COALESCE(i.return_deduction, 0)))
          END
        ), 0) as totalSales,
        COALESCE(SUM(MAX(0, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0))), 0) as totalSalesBeforeDeductions,
        COUNT(1) as totalInvoices,
        COALESCE(SUM(i.tax_total), 0) as totalTax,
        COALESCE(SUM(i.discount_total), 0) as totalDiscount
      FROM invoices i 
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type = 'BILL_OF_SUPPLY')
        AND (i.is_held IS NULL OR i.is_held = 0)
    ` : `
      SELECT 
        COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN 
          CASE
            WHEN UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND i.split_details IS NOT NULL AND ${splitJsonKey ? `'${splitJsonKey}' IS NOT NULL` : `1=0`}
              THEN CAST(COALESCE(json_extract(i.split_details, '$.${splitJsonKey || 'cash'}'), 0) AS REAL)
            ELSE MAX(0, COALESCE(i.grand_total, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0) - COALESCE(i.scrap_deduction, 0) - COALESCE(i.return_deduction, 0)))
          END
        ELSE 0 END), 0) as totalSales,
        COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN
          MAX(0, COALESCE(i.subtotal, 0) + COALESCE(i.tax_total, 0) - COALESCE(i.discount_total, 0) - COALESCE(i.points_redeemed_discount, 0))
        ELSE 0 END), 0) as totalSalesBeforeDeductions,
        COUNT(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN 1 END) as totalInvoices,
        COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN i.tax_total ELSE 0 END), 0) as totalTax,
        COALESCE(SUM(CASE WHEN (i.converted_from_invoice_id IS NULL OR i.converted_from_invoice_id = '') THEN i.discount_total ELSE 0 END), 0) as totalDiscount
      FROM invoices i 
      WHERE (i.tenant_id = ? OR i.tenant_id = 'global' OR i.tenant_id = 'unset' OR i.tenant_id IS NULL) 
        AND (i.is_deleted IS NULL OR i.is_deleted = 0 OR i.is_deleted = '0' OR i.is_deleted = '0.0' OR i.is_deleted = 0.0)
        AND (i.invoice_type NOT IN ('HOLD', 'EXPIRED_HOLD', 'RECALLED_HOLD'))
        AND (i.is_held IS NULL OR i.is_held = 0)
    `;
    const params: any[] = [activeTenantId];

    if (filters?.only_user_invoices && user_id) {
      query += ' AND i.user_id = ?';
      params.push(user_id);
    }

    if (search) {
      query += ' AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ? OR i.description LIKE ? OR i.notes LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (payment_method) {
      const pmUpper = payment_method.toUpperCase();
      if (['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'].includes(pmUpper)) {
        const jsonKey = pmUpper === 'BANK_TRANSFER' ? 'bank_transfer' : pmUpper.toLowerCase();
        query += ` AND (UPPER(i.payment_method) = ? OR (UPPER(i.payment_method) IN ('SPLIT', 'CREDIT') AND CAST(json_extract(i.split_details, '$.${jsonKey}') AS REAL) > 0))`;
        params.push(pmUpper);
      } else {
        query += ' AND UPPER(i.payment_method) = ?';
        params.push(pmUpper);
      }
    }

    if (invoice_type === 'GST_B2B') {
      query += " AND i.invoice_type = 'GST' AND i.customer_gstin IS NOT NULL AND i.customer_gstin != ''";
    } else if (invoice_type === 'GST_B2C') {
      query += " AND i.invoice_type = 'GST' AND (i.customer_gstin IS NULL OR i.customer_gstin = '')";
    } else if (invoice_type === 'BILL_OF_SUPPLY') {
      query += " AND i.invoice_type = 'BILL_OF_SUPPLY'";
    } else if (invoice_type === 'GST') {
      query += " AND i.invoice_type = 'GST'";
    }

    if (tax_rate_percent !== undefined && tax_rate_percent !== '') {
      const targetRate = parseFloat(tax_rate_percent);
      if (!isNaN(targetRate)) {
        query += ` AND EXISTS (
          SELECT 1 FROM invoice_items ii
          WHERE ii.invoice_id = i.invoice_id
            AND (
              ROUND(COALESCE(ii.cgst_rate, 0) + COALESCE(ii.sgst_rate, 0) + COALESCE(ii.igst_rate, 0)) = ?
              OR (ii.total > 0 AND ROUND((ii.tax_amount / ii.total) * 100.0) = ?)
            )
        )`;
        params.push(targetRate, targetRate);
      }
    }

    if (filterDate) {
      const cleanStart = parseCleanDate(filterDate);
      const cleanEnd = filterDateEnd ? parseCleanDate(filterDateEnd) : cleanStart;
      const { startUtc, endUtc } = getUtcRangeForStoreDateRange(cleanStart, cleanEnd, activeTenantId);

      // Use created_at for date filtering to match the grouping/ordering in the UI.
      // Using COALESCE(settled_at, created_at) caused invoices created on a different date
      // to appear under wrong date groups (e.g. filtered for Oct 12 but displayed under Oct 19).
      query += ` AND (i.created_at >= ? AND i.created_at <= ?)`;
      params.push(startUtc, endUtc);
    }

    const row = db.prepare(query).get(...params) as any;
    const totalSales = row ? Number(row.totalSales) || 0 : 0;
    const totalSalesBeforeDeductions = row ? Number(row.totalSalesBeforeDeductions) || 0 : 0;
    const totalInvoices = row ? Number(row.totalInvoices) || 0 : 0;
    const totalTax = row ? Number(row.totalTax) || 0 : 0;
    const totalDiscount = row ? Number(row.totalDiscount ?? row.discount_total) || 0 : 0;
    const avgOrder = totalInvoices > 0 ? totalSales / totalInvoices : 0;

    return { totalSales, totalSalesBeforeDeductions, totalInvoices, totalTax, totalDiscount, avgOrder };
  } catch (error) {
    console.error('[db:getInvoicesSummary] Error:', error);
    return { totalSales: 0, totalSalesBeforeDeductions: 0, totalInvoices: 0, totalTax: 0, totalDiscount: 0, avgOrder: 0 };
  }
}

/** IPC `db:getDashboardStats` */
export function getDashboardStats(tenantId: string) {
  try {
    const db = getDb();
    const dateStr = localDate(new Date(), tenantId);
    const { startUtc, endUtc } = getUtcRangeForStoreDateRange(dateStr, dateStr, tenantId);
    const row = invoicesSql.findInvoicesByConvertedFrom_(db).get(tenantId, startUtc, endUtc) as any;
    return { success: true, totalSales: row.totalSales, invoiceCount: row.invoiceCount };
  } catch (error) {
    console.error('[db:getDashboardStats]', error);
    return { success: false, totalSales: 0, invoiceCount: 0, error: 'Operation failed' };
  }
}

/** IPC `db:getInvoiceItems` */
export function getInvoiceItems(invoice_id: string) {
  try {
    const db = getDb();
    return invoicesSql.findInvoiceItemsByInvoiceId2(db).all(invoice_id);
  } catch (error) {
    console.error('[db:getInvoiceItems]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getBosConvertibleInvoices` */
export function getBosConvertibleInvoices(tenantId: string) {
  try {
    const db = getDb();
    if (!tenantId) return [];
    return invoicesSql.findInvoiceItemsByInvoiceIdAndIsGstApplicable(db).all(tenantId, tenantId);
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
