import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { einvoiceApi, type EinvoiceStatusRow } from '../../../data/einvoice';
import { bridgeEvents } from '../../../data/events';
import { isUaeStore } from '../../../utils/localization/storeProfile';

/**
 * UAE only: e-invoice statuses (mirrored from the server) for the invoices currently listed, keyed by invoice id.
 * Re-reads after each sync cycle that brought changes. Returns an empty map for Indian shops.
 */
const NO_STATUSES: Record<string, EinvoiceStatusRow> = {};

export function useEinvoiceStatuses(invoices: { invoice_id: string }[]): Record<string, EinvoiceStatusRow> {
  const { tenantId } = useAuthStore();
  const [statuses, setStatuses] = useState<Record<string, EinvoiceStatusRow>>({});
  const [revision, setRevision] = useState(0);
  const enabled = isUaeStore();
  const key = enabled ? invoices.map(i => i.invoice_id).join(',') : '';

  useEffect(() => (enabled ? bridgeEvents.onSyncCycleComplete(() => setRevision(r => r + 1)) : undefined), [enabled]);

  useEffect(() => {
    if (!enabled || !tenantId || !key) return;
    let active = true;
    void einvoiceApi.getStatuses({ tenant_id: tenantId, document_ids: key.split(',') }).then(rows => {
      if (active && Array.isArray(rows)) setStatuses(Object.fromEntries(rows.map(r => [r.document_id, r])));
    });
    return () => { active = false; };
  }, [enabled, tenantId, key, revision]);

  return enabled && key ? statuses : NO_STATUSES;
}
