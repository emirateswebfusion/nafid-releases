import { getDb } from '../db/localDb.js';
import crypto from 'node:crypto';
import * as paymentSourcesSql from '../db/statements/paymentSources.js';
/** paymentSources use-cases for the main process (called by electron/ipc handlers). */

/** IPC `db:payments:getSources` */
export function getSources(tenant_id: string) {
  try {
    const db = getDb();
    if (!tenant_id) return [];
    return paymentSourcesSql.findPaymentSourceTransactionsBySourceId(db).all(tenant_id);
  } catch (error) {
    console.error('[db:payments:getSources]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:payments:addSource` */
export function addSource(s: any) {
  try {
    const db = getDb();
    if (!s?.tenant_id || !s?.name || !s?.type) return { success: false, error: 'tenant_id, name and type are required' };
    if (!['BANK', 'CARD', 'UPI'].includes(s.type)) return { success: false, error: 'type must be BANK, CARD or UPI' };

    const tx = db.transaction(() => {
      const opening = parseFloat(s.opening_balance) || 0;
      const makeDefault = s.is_default === true || s.is_default === 1;
      const source_id = s.source_id || crypto.randomUUID();

      if (makeDefault) {
        paymentSourcesSql.updatePaymentSourceIsDefault(db)
          .run(s.tenant_id, s.type);
      }

      paymentSourcesSql.insertPaymentSource(db).run(
        source_id, s.tenant_id, s.name.trim(), s.type,
        s.bank_name?.trim() || null, s.account_number?.trim() || null,
        s.holder_name?.trim() || null, s.upi_id?.trim() || null,
        opening, opening, makeDefault ? 1 : 0, s.is_enabled === false ? 0 : 1,
        s.sort_order ?? 0
      );

      if (opening > 0) {
        paymentSourcesSql.insertPaymentSourceTransaction(db).run(
          crypto.randomUUID(), s.tenant_id, source_id, opening,
          `Opening balance for ${s.name.trim()}`, opening, s.created_by || null, s.created_by_name || null
        );
      }
      return source_id;
    });

    const source_id = tx();
    return { success: true, source_id };
  } catch (error) {
    console.error('[db:payments:addSource]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:payments:updateSource` */
export function updateSource(s: any) {
  try {
    const db = getDb();
    if (!s?.source_id || !s?.tenant_id) return { success: false, error: 'source_id and tenant_id are required' };

    const tx = db.transaction(() => {
      const existing = paymentSourcesSql.findPaymentSourcesBySourceId(db).get(s.source_id, s.tenant_id) as any;
      if (!existing) throw new Error('Payment source not found');

      if (s.is_default === true) {
        paymentSourcesSql.updatePaymentSourceIsDefault(db)
          .run(s.tenant_id, existing.type);
      }

      let newOpening: number | null = null;
      if (s.opening_balance !== undefined) {
        const parsedOpening = parseFloat(s.opening_balance) || 0;
        if (parsedOpening !== Number(existing.opening_balance)) {
          const txCount = (paymentSourcesSql.countPaymentSourceTransactionsBySourceId(db).get(s.source_id) as any).cnt;
          if (txCount > 0) throw new Error('Opening balance can only be changed when there are no transactions on this source');
          newOpening = parsedOpening;
        }
      }

      paymentSourcesSql.updatePaymentSourceBySourceId(db).run(
        s.name?.trim() || null,
        s.bank_name !== undefined ? (s.bank_name?.trim() || null) : existing.bank_name,
        s.account_number !== undefined ? (s.account_number?.trim() || null) : existing.account_number,
        s.holder_name !== undefined ? (s.holder_name?.trim() || null) : existing.holder_name,
        s.upi_id !== undefined ? (s.upi_id?.trim() || null) : existing.upi_id,
        s.is_enabled !== undefined ? (s.is_enabled === true || s.is_enabled === 1 ? 1 : 0) : undefined,
        s.is_default !== undefined ? (s.is_default === true || s.is_default === 1 ? 1 : 0) : undefined,
        s.sort_order !== undefined ? s.sort_order : undefined,
        newOpening,
        newOpening !== null ? newOpening : undefined,
        s.source_id, s.tenant_id
      );

      if (newOpening !== null) {
        paymentSourcesSql.updatePaymentSourceTransactionAmountAndRunningBalance(db)
          .run(newOpening, newOpening, s.source_id, s.tenant_id);
      }
    });

    tx();
    return { success: true };
  } catch (error) {
    console.error('[db:payments:updateSource]', error);
    if ((error as Error).message?.includes('Opening balance')) return { success: false, error: (error as Error).message };
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:payments:deleteSource` */
export function deleteSource({ source_id, tenant_id }: { source_id: string; tenant_id: string }) {
  try {
    const db = getDb();
    const result = paymentSourcesSql.updatePaymentSourceIsDeleted(db)
      .run(source_id, tenant_id);
    if (result.changes === 0) return { success: false, error: 'Payment source not found' };
    return { success: true };
  } catch (error) {
    console.error('[db:payments:deleteSource]', error);
    return { success: false, error: 'Operation failed' };
  }
}

/** IPC `db:payments:getTransactions` */
export function getTransactions({ source_id, tenant_id }: { source_id: string; tenant_id: string }) {
  try {
    const db = getDb();
    if (!source_id || !tenant_id) return [];
    return paymentSourcesSql.findPaymentSourceTransactionsBySourceId2(db).all(source_id, tenant_id);
  } catch (error) {
    console.error('[db:payments:getTransactions]', error);
    return { error: 'Operation failed' };
  }
}

/** IPC `db:payments:addTransaction` */
export function addTransaction(t: any) {
  try {
    const db = getDb();
    if (!t?.tenant_id || !t?.source_id) return { success: false, error: 'tenant_id and source_id are required' };
    if (!['CASH_IN', 'CASH_OUT'].includes(t.type)) return { success: false, error: 'type must be CASH_IN or CASH_OUT' };
    const amount = Number(t.amount);
    if (!isFinite(amount) || amount <= 0) return { success: false, error: 'amount must be a positive number' };

    const tx = db.transaction(() => {
      const source = paymentSourcesSql.findPaymentSourcesBySourceId(db).get(t.source_id, t.tenant_id) as any;
      if (!source) throw new Error('Payment source not found');

      const currentBalance = Number(source.current_balance) || 0;
      const newBalance = t.type === 'CASH_IN' ? currentBalance + amount : currentBalance - amount;

      paymentSourcesSql.insertPaymentSourceTransaction2(db).run(
        t.transaction_id || crypto.randomUUID(), t.tenant_id, t.source_id, t.type, amount,
        t.category?.trim() || null, t.notes?.trim() || null, t.reference_number?.trim() || null,
        t.transaction_date || null, newBalance, t.entered_by || null, t.entered_by_name || null
      );

      paymentSourcesSql.updatePaymentSourceCurrentBalance(db)
        .run(newBalance, t.source_id, t.tenant_id);

      return newBalance;
    });

    const balance = tx();
    return { success: true, balance };
  } catch (error) {
    console.error('[db:payments:addTransaction]', error);
    return { success: false, error: 'Operation failed' };
  }
}
