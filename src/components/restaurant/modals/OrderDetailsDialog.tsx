import { useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { DELIVERY_CHANNELS, type OrderType, type RestaurantOrder } from '../../../data/restaurant';
import type { StaffListItem } from '../../../data/staff';

interface OrderDetailsDialogProps {
  title: string;
  orderType: OrderType;
  order?: RestaurantOrder | null;
  staff: StaffListItem[];
  onCancel: () => void;
  onSave: (fields: Record<string, unknown>) => void;
}

const field = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm';

/** New order / edit order: covers and waiter (dine-in), customer (takeaway), address, app and fee (delivery). */
export function OrderDetailsDialog({ title, orderType, order, staff, onCancel, onSave }: OrderDetailsDialogProps) {
  const [covers, setCovers] = useState(String(order?.covers || (orderType === 'DINE_IN' ? 2 : 0)));
  const [waiter, setWaiter] = useState(order?.waiter_user_id ?? '');
  const [name, setName] = useState(order?.customer_name ?? '');
  const [phone, setPhone] = useState(order?.customer_phone ?? '');
  const [address, setAddress] = useState(order?.delivery_address ?? '');
  const [channel, setChannel] = useState(order?.channel ?? 'OWN');
  const [channelRef, setChannelRef] = useState(order?.channel_ref ?? '');
  const [fee, setFee] = useState(String(order?.delivery_fee ?? 0));
  const [note, setNote] = useState(order?.note ?? '');
  const waiterName = staff.find(s => s.staff_id === waiter)?.name ?? null;

  return (
    <Modal isOpen onClose={onCancel} title={title}>
      <div className="grid grid-cols-2 gap-3">
        {orderType === 'DINE_IN' && (
          <label className="text-xs font-bold">Guests
            <input className={field} inputMode="numeric" value={covers} onChange={e => setCovers(e.target.value.replace(/\D/g, ''))} />
          </label>
        )}
        <label className="text-xs font-bold">Waiter
          <select className={field} value={waiter} onChange={e => setWaiter(e.target.value)}>
            <option value="">—</option>
            {staff.map(s => <option key={s.staff_id} value={s.staff_id}>{s.name}</option>)}
          </select>
        </label>
        {orderType !== 'DINE_IN' && (
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
                {DELIVERY_CHANNELS.map(c => <option key={c} value={c}>{c === 'OWN' ? 'Own delivery' : c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
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
            <label className="col-span-2 text-xs font-bold">Address
              <textarea className={field} rows={2} value={address} onChange={e => setAddress(e.target.value)} />
            </label>
          </>
        )}
        <label className="col-span-2 text-xs font-bold">Order note (printed on kitchen tickets)
          <input className={field} value={note} onChange={e => setNote(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({
          covers: Number(covers) || 0, waiter_user_id: waiter || null, waiter_name: waiterName,
          customer_name: name.trim() || null, customer_phone: phone.trim() || null, delivery_address: address.trim() || null,
          channel: orderType === 'DELIVERY' ? channel : 'OWN', channel_ref: channel !== 'OWN' ? channelRef.trim() || null : null,
          delivery_fee: orderType === 'DELIVERY' && channel === 'OWN' ? Number(fee) || 0 : 0, note: note.trim() || null,
        })}>Save</Button>
      </div>
    </Modal>
  );
}
