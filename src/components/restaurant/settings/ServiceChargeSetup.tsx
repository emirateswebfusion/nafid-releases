import { useState } from 'react';
import { Button } from '../../ui/Button';
import { setSetting } from '../../../data/settings';
import type { OrderType } from '../../../data/restaurant';
import { isUaeStore } from '../../../utils/localization/storeProfile';
import { SERVICE_CHARGE_SETTING_KEY, type ServiceChargeSetting } from '../restaurantRules';

interface ServiceChargeSetupProps {
  tenantId: string;
  value: ServiceChargeSetting;
  onChanged: () => void;
  onError: (message: string) => void;
}

const TYPES: { key: OrderType; label: string }[] = [{ key: 'DINE_IN', label: 'Dine-in' }, { key: 'TAKEAWAY', label: 'Takeaway' }, { key: 'DELIVERY', label: 'Delivery' }];

/** Optional service charge, added as a bill line at billing (UAE: standard-rated, VAT 5% applies to it). */
export function ServiceChargeSetup({ tenantId, value, onChanged, onError }: ServiceChargeSetupProps) {
  const [form, setForm] = useState(value);
  const save = async () => {
    try {
      await setSetting({ tenant_id: tenantId, key: SERVICE_CHARGE_SETTING_KEY, value: form });
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <div className="max-w-lg space-y-3">
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Add a service charge
      </label>
      <div className="flex gap-3">
        <label className="text-xs font-bold">Percent<br />
          <input className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm" value={form.percent}
            onChange={e => setForm({ ...form, percent: Math.min(100, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) })} />
        </label>
        <label className="text-xs font-bold">Bill line text<br />
          <input className="w-56 rounded-lg border border-border bg-background px-2 py-1 text-sm" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
        </label>
      </div>
      <div className="flex gap-3 text-sm">
        {TYPES.map(t => (
          <label key={t.key} className="flex items-center gap-1">
            <input type="checkbox" checked={form.orderTypes.includes(t.key)}
              onChange={e => setForm({ ...form, orderTypes: e.target.checked ? [...form.orderTypes, t.key] : form.orderTypes.filter(x => x !== t.key) })} />{t.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {isUaeStore()
          ? 'In the UAE a service charge is part of the price of the supply, so VAT 5% is charged on it. It is added as a separate bill line, on the same price basis as your menu prices.'
          : 'The charge is added as a separate service line on the bill.'}
      </p>
      <Button onClick={() => void save()}>Save</Button>
    </div>
  );
}
