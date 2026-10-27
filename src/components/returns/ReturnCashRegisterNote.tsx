import { useEffect, useState } from 'react';
import { getSetting } from '../../data/settings';

export function ReturnCashRegisterNote({ tenantId }: { tenantId: string | null }) {
  const [deduct, setDeduct] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    getSetting({ tenant_id: tenantId || 'global', key: 'cash_register_deduct_returns' }).then(value => {
      if (active) setDeduct(value !== false);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [tenantId]);
  return <p className="px-5 py-2 text-xs text-muted-foreground" role="status">{failed
    ? 'Could not load the cash register refund setting.'
    : deduct === null ? 'Loading cash register refund setting…'
    : deduct ? 'Cash refunds are deducted from the register and cash settlement. Return totals record the actual refund.'
    : 'Cash refunds are excluded from register and cash settlement totals. Return totals still record the actual refund.'}</p>;
}
