import type { Db } from './types.js';

/** SQL statements used by services/cardTerminalService.ts. Each factory prepares its statement on the given connection. */

export const insertTransaction = (db: Db) => db.prepare(`
      INSERT INTO card_terminal_transactions
        (id, tenant_id, invoice_id, ecr_ref, kind, amount_minor, currency, provider, status, original_ecr_ref, created_at, updated_at)
      VALUES (@id, @tenant_id, @invoice_id, @ecr_ref, @kind, @amount_minor, @currency, @provider, 'SENT', @original_ecr_ref, @now, @now)`);

export const updateResult = (db: Db) => db.prepare(`
      UPDATE card_terminal_transactions SET status = @status, auth_code = @auth_code, rrn = @rrn, terminal_id = @terminal_id,
        masked_pan = @masked_pan, scheme = @scheme, response_code = @response_code, message = @message,
        resolved_by = @resolved_by, updated_at = @now
      WHERE ecr_ref = @ecr_ref`);

export const updateStatus = (db: Db) => db.prepare(
  'UPDATE card_terminal_transactions SET status = ?, updated_at = ? WHERE ecr_ref = ?');

export const findByEcrRef = (db: Db) => db.prepare('SELECT * FROM card_terminal_transactions WHERE ecr_ref = ?');

export const listRecent = (db: Db) => db.prepare(`
      SELECT * FROM card_terminal_transactions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`);

export const listUnresolved = (db: Db) => db.prepare(`
      SELECT * FROM card_terminal_transactions WHERE tenant_id = ? AND status IN ('SENT', 'UNKNOWN') ORDER BY created_at`);

export const findInvoiceSplitDetails = (db: Db) => db.prepare('SELECT split_details FROM invoices WHERE invoice_id = ?');

export const findConfig = (db: Db) => db.prepare(
  "SELECT value FROM settings WHERE key = 'card_terminal_config' ORDER BY CASE WHEN tenant_id = 'global' THEN 0 ELSE 1 END LIMIT 1");
