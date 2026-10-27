import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createCoreTables } from '../../electron/db/schemaCoreTables';
import { createExtendedTables } from '../../electron/db/schemaExtendedTables';
import { findReturnsByReferenceNumber } from '../../electron/db/statements/partyLedger';
let sql: DatabaseSync;
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  createCoreTables(sql as unknown as Parameters<typeof createCoreTables>[0]);
  createExtendedTables(sql as unknown as Parameters<typeof createExtendedTables>[0]);
  sql.exec("INSERT INTO invoices (invoice_id,tenant_id,invoice_number,subtotal,grand_total,payment_method) VALUES ('walk','t','INV-1',100,100,'CASH')");
  sql.exec("INSERT INTO invoices (invoice_id,tenant_id,invoice_number,subtotal,grand_total,payment_method,customer_phone) VALUES ('cust','t','INV-2',100,100,'CASH','9999')");
});
afterEach(() => sql.close());
const unlinked = () => (findReturnsByReferenceNumber(sql as unknown as Parameters<typeof findReturnsByReferenceNumber>[0]).all() as { return_number: string }[])
  .map(r => r.return_number).sort();
const addReturn = (no: string, invoice: string, name: string | null = null) => sql.prepare(
  "INSERT INTO returns (return_id,invoice_id,tenant_id,return_number,grand_total,refund_method,customer_name) VALUES (?,?,'t',?,50,'ADJUST_BILL',?)",
).run(no, invoice, no, name);
it('skips walk-in returns that have no party to post to, so the backfill does not re-scan them forever', () => {
  addReturn('R-WALK', 'walk');
  addReturn('R-BLANK', 'walk', '   ');
  addReturn('R-NAMED', 'walk', 'Ravi');
  addReturn('R-INV-PHONE', 'cust');
  expect(unlinked()).toEqual(['R-INV-PHONE', 'R-NAMED']);
});
it('stops selecting a customer return once its ledger entry exists', () => {
  addReturn('R-NAMED', 'walk', 'Ravi');
  sql.exec('PRAGMA foreign_keys = OFF');
  sql.exec("INSERT INTO party_ledger (ledger_id,party_id,tenant_id,transaction_date,description,reference_number,debit_amount,running_balance) VALUES ('l','p','t','2026-10-27','Sales Return','R-NAMED',50,-50)");
  expect(unlinked()).toEqual([]);
});
