import { useRef, useState } from 'react';
import { useCloseOnEscape } from '../../../hooks/useCloseOnEscape';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import type { OrderType, RestaurantOrder } from '../../../data/restaurant';
import { isUaeStore } from '../../../utils/localization/storeProfile';
import { deliveryChannels } from '../restaurantRules';
import type { StaffListItem } from '../../../data/staff';

interface OrderDetailsDialogProps {
  title: string;
  orderType: OrderType;
  order?: RestaurantOrder | null;
  staff: StaffListItem[];
  onCancel: () => void;
  onSave: (fields: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
}

const field = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm';

/** New order / edit order: covers and waiter (dine-in), customer (takeaway), address, app and fee (delivery). */
export function OrderDetailsDialog({ title, orderType, order, staff, onCancel, onSave }: OrderDetailsDialogProps) {
  const [covers, setCovers] = useState(String(order?.covers ?? (orderType === 'DINE_IN' ? 2 : 0)));
  const [waiter, setWaiter] = useState(order?.waiter_user_id ?? '');
  const [name, setName] = useState(order?.customer_name ?? '');
  const [phone, setPhone] = useState(order?.customer_phone ?? '');
  const [address, setAddress] = useState(order?.delivery_address ?? '');
  const [channel, setChannel] = useState(order?.channel ?? 'OWN');
  const [channelRef, setChannelRef] = useState(order?.channel_ref ?? '');
  const [fee, setFee] = useState(String(order?.delivery_fee ?? 0));
  const [note, setNote] = useState(order?.note ?? '');
  const waiterName = staff.find(s => s.staff_id === waiter)?.name ?? (waiter && waiter === order?.waiter_user_id ? order.waiter_name : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const close = () => { if (!inFlight.current) onCancel(); };
  useCloseOnEscape(close);

  return (
    <Modal isOpen onClose={close} title={title}>
      <fieldset disabled={saving} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {orderType === 'DINE_IN' && (
          <label className="text-xs font-bold">Guests
            <input className={field} inputMode="numeric" value={covers} onChange={e => setCovers(e.target.value.replace(/\D/g, ''))} />
          </label>
        )}
        <label className="text-xs font-bold">Waiter
          <select className={field} value={waiter} onChange={e => setWaiter(e.target.value)}>
            <option value="">Unassigned</option>
            {waiter && !staff.some(s => s.staff_id === waiter) && <option value={waiter}>{order?.waiter_name || 'Previously assigned staff'}</option>}
            {staff.map(s => <option key={s.staff_id} value={s.staff_id}>{s.name}</option>)}
          </select>
        </label>
        {(
          <>
            <label className="text-xs font-bold">Customer name
              <input className={field} value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="text-xs font-bold">Phone
              <input className={field} value={phone} onChange={e => setPhone(e.target.value)} />
            </label>
          </>
        )}
        {orderType === 'DELIVERY' && (
          <>
            <label className="text-xs font-bold">Order from
              <select className={field} value={channel} onChange={e => setChannel(e.target.value)}>
                {deliveryChannels(isUaeStore()).map(c => <option key={c} value={c}>{c === 'OWN' ? 'Own delivery' : c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
              </select>
            </label>
            {channel !== 'OWN' ? (
              <label className="text-xs font-bold">App order number
                <input className={field} value={channelRef} onChange={e => setChannelRef(e.target.value)} />
              </label>
            ) : (
              <label className="text-xs font-bold">Delivery fee
                <input className={field} inputMode="decimal" value={fee} onChange={e => setFee(e.target.value.replace(/[^\d.]/g, ''))} />
              </label>
            )}
            <label className="sm:col-span-2 text-xs font-bold">Address
              <textarea className={field} rows={2} value={address} onChange={e => setAddress(e.target.value)} />
            </label>
          </>
        )}
        <label className="sm:col-span-2 text-xs font-bold">Order note (printed on kitchen tickets)
          <input className={field} value={note} onChange={e => setNote(e.target.value)} />
        </label>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" disabled={saving} onClick={close}>Cancel</Button>
        <Button disabled={saving} onClick={async () => {
          if (inFlight.current) return;
          if (orderType === 'DINE_IN' && (!Number.isInteger(Number(covers)) || Number(covers) < 1)) { setError('Enter at least one guest.'); return; }
          if (orderType === 'DELIVERY' && channel === 'OWN' && (!Number.isFinite(Number(fee)) || Number(fee) < 0)) { setError('Enter a valid delivery fee.'); return; }
          inFlight.current = true; setSaving(true); setError('');
          try { const result = await onSave({
          covers: Number(covers) || 0, waiter_user_id: waiter || null, waiter_name: waiterName,
          customer_name: name.trim() || null, customer_phone: phone.trim() || null, delivery_address: address.trim() || null,
          channel: orderType === 'DELIVERY' ? channel : 'OWN', channel_ref: channel !== 'OWN' ? channelRef.trim() || null : null,
          delivery_fee: orderType === 'DELIVERY' && channel === 'OWN' ? Number(fee) || 0 : 0, note: note.trim() || null,
        }); if (result === false) setError('Could not save order details. Your changes are kept; please retry.');
          } catch (e) { setError(e instanceof Error ? e.message : 'Could not save order details.'); }
          finally { inFlight.current = false; setSaving(false); }
        }}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </Modal>
  );
}
