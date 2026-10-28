/** Editing a credit bill: the tab must keep the bill's own credit, or the due and limit checks count the bill twice. */
import { describe, expect, it } from 'vitest';
import { useTabStore } from '../../src/store/tabStore';

describe('tab store keeps the edited bill credit', () => {
  it.each(['updateActiveTab', 'updateTabById'] as const)('%s stores editingInvoiceContribution and editingInvoicePartyKey', (method) => {
    const store = useTabStore.getState();
    const id = store.addTab();
    const updates = { editingInvoiceContribution: 8190, editingInvoicePartyKey: 'ws indus tiles|9000000109' };
    if (method === 'updateActiveTab') useTabStore.getState().updateActiveTab(updates);
    else useTabStore.getState().updateTabById(id, updates);
    const tab = useTabStore.getState().tabs.find(t => t.id === id);
    expect(tab).toMatchObject(updates);
  });
});
