import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('sync audit fixes', () => {
  it('protects FAILED rows in invoice, purchase bill, cash drawer, and lightweight pull SQL', () => {
    expect(read('electron/db/statements/sync/salesDocsSync.ts')).toContain("WHERE invoices.sync_status NOT IN ('PENDING', 'FAILED')");
    expect(read('electron/db/statements/sync/syncCycle.ts')).toContain("WHERE invoices.sync_status NOT IN ('PENDING', 'FAILED')");
    expect(read('electron/db/statements/sync/cashSync.ts')).toContain("AND sync_status NOT IN ('PENDING', 'FAILED')");
    expect(read('electron/sync/entities/cashSync.ts')).toContain("existing.sync_status === 'PENDING' || existing.sync_status === 'FAILED'");
    expect(read('electron/sync/entities/stockDocsSync.ts')).toContain("prior.sync_status === 'PENDING' || prior.sync_status === 'FAILED'");
    expect(read('electron/sync/entities/stockDocsSync.ts')).toContain('if (info.changes > 0 && Array.isArray(bill.items))');
    expect(read('electron/sync/entities/catalogSync.ts')).toContain('if (info.changes > 0 && Array.isArray(c.items))');
  });

  it('marks scrap edit inserts PENDING and persists edited purchase bill_number', () => {
    const scrapSql = read('electron/db/statements/scrap.ts');
    expect(scrapSql).toContain('scrap_invoice_number, payment_status, sync_status, created_at, updated_at');
    expect(scrapSql).toContain("VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING'");
    expect(read('electron/db/statements/purchases.ts')).toContain('bill_number = COALESCE(?, bill_number)');
  });

  it('preserves boolean settings values and strips tenant prefix for settings ops in outboxSync', () => {
    const src = read('electron/db/statements/sync/outboxSync.ts');
    expect(src).toContain("if (entity === 'settings' && typeof values.value === 'boolean') values.value = JSON.stringify(values.value)");
    expect(src).toContain('op.entity_id.startsWith(`${op.tenant_id}:`)');
  });

  it('keeps shared cash register settings in pullSettings and isolates local-only UI/terminal config', () => {
    const src = read('electron/sync/entities/settingsSync.ts');
    for (const localKey of ['billing_ui_config', 'card_terminal_config']) {
      expect(src).toContain(`'${localKey}'`);
    }
    for (const sharedKey of ['cash_register_include_scrap_sales', 'cash_register_deduct_returns', 'business_category', 'quotation_gst_enabled', 'auto_whatsapp_send']) {
      expect(src).toContain(`'${sharedKey}'`);
    }
  });

  it('records users pull cursor so checkCloudStatus optimization is not bypassed', () => {
    expect(read('electron/sync/entities/partiesSync.ts')).toContain("setMeta(cursorKey(tenantId, 'users'), new Date().toISOString())");
  });

  it('clears SalesHistory invoiceDetailsCache when sync updates SQLite', () => {
    expect(read('src/components/sales/SalesHistory.tsx')).toContain('invoiceDetailsCache.current.clear()');
  });
});
