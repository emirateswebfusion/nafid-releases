import { getDb } from '../db/localDb.js';
import { getOrInitTerminalCode } from './invoiceNumberService.js';
import { triggerUrgentQuotationSync } from '../sync/syncWorker.js';
import * as quotationsSql from '../db/statements/quotations.js';
/** quotations use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:getNextQuotationNumber` */
export function getNextQuotationNumber({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const configKey = 'quotation_counter';

    const result = db.transaction(() => {
      const row: any = quotationsSql.findSettingsByKey(db).get('global', configKey);
      let counter = 1;
      let config: { prefix: string; counter: number } = { prefix: `${terminalCode}-QTN-`, counter: 1 };

      if (row) {
        try {
          const parsed = JSON.parse(row.value);
          counter = (typeof parsed.counter === 'number' ? parsed.counter : 1);
          const rawPrefix = parsed.prefix && /[A-Z0-9]/i.test(parsed.prefix) ? parsed.prefix : `${terminalCode}-QTN-`;
          if (rawPrefix.includes('-QTN-')) {
          // Respect user-set prefix -- no forced override
          }
          config = { prefix: rawPrefix, counter };
        } catch {
          counter = 1;
        }
      }

      const prefix = config.prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || `${terminalCode}-QTN-`;
      const quotationNumber = `${prefix}${String(counter).padStart(3, '0')}`;

      config.counter = counter + 1;
      quotationsSql.upsertSetting(db).run(configKey, JSON.stringify(config));

      return { success: true, quotationNumber, counter };
    })();

    return result;
  } catch (error) {
    console.error('[db:getNextQuotationNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:peekNextQuotationNumber` */
export function peekNextQuotationNumber({ tenant_id }: { tenant_id: string }) {
  try {
    const db = getDb();
    const terminalCode = getOrInitTerminalCode(db);
    const defaultPrefix = `${terminalCode}-QTN-`;

    const row: any = quotationsSql.findSettingsByKey(db).get('global', 'quotation_counter');
    if (row) {
      try {
        const config = JSON.parse(row.value);
        const rawPrefix = config.prefix && /[A-Z0-9]/i.test(config.prefix) ? config.prefix : defaultPrefix;
        if (rawPrefix.includes('-QTN-')) {
          // Respect user-set prefix -- no forced override
        }
        const prefix = rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || defaultPrefix;
        return { success: true, quotationNumber: `${prefix}${String(config.counter || 1).padStart(3, '0')}` };
      } catch {
        // Invalid JSON in stored value — fall through to default
      }
    }
    return { success: true, quotationNumber: `${terminalCode}-QTN-001` };
  } catch (error) {
    console.error('[db:peekNextQuotationNumber]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:saveQuotation` */
export function saveQuotation(q: any) {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      const qCols = quotationsSql.pragmaTableInfo(db).all().map((c: any) => c.name);
      if (qCols.includes('customer_gstin')) {
        quotationsSql.upsertQuotation(db).run(
          q.quotation_id, q.tenant_id, q.quotation_number, q.customer_name || null, q.customer_phone || null, q.customer_address || null,
          q.customer_gstin || null, q.customer_state || null, q.is_gst ?? (Number(q.tax_total) > 0 ? 1 : 0),
          Number(q.discount_total) || 0, Number(q.round_off) || 0, q.biller_name || null,
          q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total
        );
      } else {
        quotationsSql.upsertQuotationActive(db).run(q.quotation_id, q.tenant_id, q.quotation_number, q.customer_name || null, q.customer_phone || null, q.customer_address || null, q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total);
      }

      // Delete old items before inserting new ones to prevent duplicate rows
      quotationsSql.deleteQuotationItemByQuotationId(db).run(q.quotation_id);

      const qiCols = quotationsSql.pragmaTableInfo2(db).all().map((c: any) => c.name);
      if (qiCols.includes('hsn_code')) {
        const stmt = quotationsSql.insertQuotationItem(db);
        for (const item of q.items) {
          stmt.run(
            item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount,
            item.hsn_code || null, item.uom || null, Number(item.tax_rate_percent) || 0,
            Number(item.discount_amount) || 0, Number(item.discount_percent) || 0,
            Number(item.taxable_amount) || item.amount,
            Number(item.cgst_amount) || 0, Number(item.sgst_amount) || 0, Number(item.igst_amount) || 0
          );
        }
      } else {
        const stmt = quotationsSql.insertQuotationItem2(db);
        for (const item of q.items) {
          stmt.run(item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount);
        }
      }
      return { success: true };
    })();
    triggerUrgentQuotationSync().catch(() => {});
    return result;
  } catch (error) {
    console.error('[db:saveQuotation]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:getQuotations` */
export function getQuotations({ tenant_id, search }: { tenant_id: string; search?: string }) {
  try {
    const db = getDb();
    const tid = tenant_id || 'global';
    const { statement, params } = quotationsSql.getQuotationsStatement(db, { tid, search });
    return statement.all(...params);
  } catch (error) {
    console.error('[db:getQuotations]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:getQuotationItems` */
export async function getQuotationItems(quotationId: string) {
  try {
    const db = getDb();
    const qiCols = quotationsSql.pragmaTableInfo2(db).all().map((c: any) => c.name);
    let selectFields = 'qi.*';
    if (qiCols.includes('hsn_code')) {
      selectFields = "qi.*, COALESCE(NULLIF(TRIM(qi.hsn_code), ''), p.hsn_sac_code, '') AS hsn_code, COALESCE(NULLIF(TRIM(qi.uom), ''), p.uom, 'PCS') AS uom, COALESCE(NULLIF(qi.tax_rate_percent, 0), p.tax_rate_percent, qi.tax_rate_percent, 0) AS tax_rate_percent, COALESCE(p.is_gst_applicable, 1) AS is_gst_applicable";
    } else {
      selectFields = "qi.*, COALESCE(p.hsn_sac_code, '') AS hsn_code, COALESCE(p.uom, 'PCS') AS uom, COALESCE(p.tax_rate_percent, 0) AS tax_rate_percent, COALESCE(p.is_gst_applicable, 1) AS is_gst_applicable";
    }
        let items = quotationsSql.listQuotationItems(db, selectFields).all(quotationId);
    if ((!items || items.length === 0) && quotationId) {
      const q = quotationsSql.findQuotationsByQuotationId(db).get(quotationId) as any;
      if (q && (Number(q.subtotal) > 0 || Number(q.grand_total) > 0)) {
        console.log(`[db:getQuotationItems] Repairing missing items for quotation ${quotationId}...`);
        quotationsSql.updateQuotationByQuotationId(db).run(quotationId);
        triggerUrgentQuotationSync().catch(() => {});
        await new Promise(r => setTimeout(r, 300));
        items = quotationsSql.listQuotationItems(db, selectFields).all(quotationId);
      }
    }
    if (Array.isArray(items) && items.length > 1) {
      const timestamps: number[] = items.map((i: any) => i.created_at ? new Date(i.created_at).getTime() : 0).filter(Boolean);
      const uniqueTs = Array.from(new Set<number>(timestamps));
      if (uniqueTs.length > 1) {
        const latestTs = Math.max(...uniqueTs);
        items = items.filter((i: any) => (i.created_at ? new Date(i.created_at).getTime() : 0) === latestTs);
      }
    }
    return items;
  } catch (error) {
    console.error('[db:getQuotationItems]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:deleteQuotation` */
export function deleteQuotation(quotationId: string) {
  try {
    const db = getDb();
    db.transaction(() => {
      quotationsSql.updateQuotationStatus(db).run(quotationId);
      quotationsSql.deleteQuotationItemByQuotationId(db).run(quotationId);
    })();
    triggerUrgentQuotationSync().catch(() => {});
    return { success: true };
  } catch (error) {
    console.error('[db:deleteQuotation]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updateQuotation` */
export function updateQuotation(q: any) {
  try {
    const db = getDb();
    const result = db.transaction(() => {
      const qCols = quotationsSql.pragmaTableInfo(db).all().map((c: any) => c.name);
      if (qCols.includes('customer_gstin')) {
        quotationsSql.updateQuotationByQuotationId2(db).run(
          q.customer_name || null, q.customer_phone || null, q.customer_address || null,
          q.customer_gstin || null, q.customer_state || null, q.is_gst ?? (Number(q.tax_total) > 0 ? 1 : 0),
          Number(q.discount_total) || 0, Number(q.round_off) || 0, q.biller_name || null,
          q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total, q.quotation_id
        );
      } else {
        quotationsSql.updateQuotationByQuotationId3(db).run(q.customer_name || null, q.customer_phone || null, q.customer_address || null, q.terms_conditions || null, q.subtotal, q.tax_total, q.grand_total, q.quotation_id);
      }

      // Delete old items
      quotationsSql.deleteQuotationItemByQuotationId(db).run(q.quotation_id);

      // Insert new items
      const qiCols = quotationsSql.pragmaTableInfo2(db).all().map((c: any) => c.name);
      if (qiCols.includes('hsn_code')) {
        const stmt = quotationsSql.insertQuotationItem(db);
        for (const item of q.items) {
          stmt.run(
            item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount,
            item.hsn_code || null, item.uom || null, Number(item.tax_rate_percent) || 0,
            Number(item.discount_amount) || 0, Number(item.discount_percent) || 0,
            Number(item.taxable_amount) || item.amount,
            Number(item.cgst_amount) || 0, Number(item.sgst_amount) || 0, Number(item.igst_amount) || 0
          );
        }
      } else {
        const stmt = quotationsSql.insertQuotationItem2(db);
        for (const item of q.items) {
          stmt.run(item.item_id, q.quotation_id, q.tenant_id, item.product_id || null, item.name, item.quantity, item.weight || null, item.rate, item.amount);
        }
      }
      return { success: true };
    })();
    triggerUrgentQuotationSync().catch(() => {});
    return result;
  } catch (error) {
    console.error('[db:updateQuotation]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:updateQuotationStatus` */
export function updateQuotationStatus({ quotation_id, status, converted_to_invoice, invoice_id }: { quotation_id: string; status?: string; converted_to_invoice?: number; invoice_id?: string }) {
  try {
    const db = getDb();
    const { statement, params } = quotationsSql.updateQuotationStatusStatement(db, { status, converted_to_invoice, invoice_id, quotation_id });
    statement.run(...params);
    triggerUrgentQuotationSync().catch(() => {});
    return { success: true };
  } catch (error) {
    console.error('[db:updateQuotationStatus]', error);
    return { success: false, error: 'Operation failed' };
  }
}
