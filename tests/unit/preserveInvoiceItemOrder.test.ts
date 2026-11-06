import { expect, it } from 'vitest';
import { preserveInvoiceItemOrder } from '../../electron/sync/invoiceItemOrder';
const line = (item_id: string) => ({ item_id });
it('preserves saved order, removes deleted lines and appends new lines in incoming order', () => {
  const incoming = ['new-b', 'third', 'new-a', 'first'].map(line);
  expect(preserveInvoiceItemOrder(incoming, ['first', 'deleted', 'third'].map(line)).map(item => item.item_id))
    .toEqual(['first', 'third', 'new-b', 'new-a']);
  expect(incoming.map(item => item.item_id)).toEqual(['new-b', 'third', 'new-a', 'first']);
});
it('keeps incoming order when this terminal has no saved lines', () => {
  const incoming = ['z', 'a', 'm'].map(line);
  expect(preserveInvoiceItemOrder(incoming, [])).toEqual(incoming);
});
