import { Bike, ShoppingBag } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { ActiveOrders, OrderType, RestaurantOrder } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';
import { minutesSince, orderValue } from '../restaurantRules';

interface TokenOrdersViewProps {
  active: ActiveOrders;
  onNew: (type: OrderType) => void;
  onOpenOrder: (order: RestaurantOrder) => void;
}

/** Takeaway and delivery orders (token numbers), with delivery channel and customer. */
export function TokenOrdersView({ active, onNew, onOpenOrder }: TokenOrdersViewProps) {
  const orders = active.orders.filter(o => o.order_type !== 'DINE_IN');
  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2">
        <Button onClick={() => onNew('TAKEAWAY')}><ShoppingBag className="mr-2 h-4 w-4" />New takeaway</Button>
        <Button variant="outline" onClick={() => onNew('DELIVERY')}><Bike className="mr-2 h-4 w-4" />New delivery</Button>
      </div>
      {orders.length === 0 ? (
        <div className="p-10 text-center text-muted-foreground">No open takeaway or delivery orders.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {orders.map(order => {
            const lines = active.lines.filter(l => l.order_id === order.order_id);
            const ready = active.kots.some(k => k.order_id === order.order_id && k.kind === 'NEW' && k.kds_status === 'READY');
            return (
              <button key={order.order_id} type="button" onClick={() => onOpenOrder(order)}
                className={`rounded-2xl border-2 p-3 text-left transition active:scale-95 ${order.status === 'BILLING' ? 'border-amber-500 bg-amber-500/10' : 'border-border bg-card hover:bg-muted'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black">#{order.order_no}</span>
                  <span className="text-[10px] font-black uppercase text-muted-foreground">{order.order_type === 'DELIVERY' ? (order.channel === 'OWN' ? 'Delivery' : order.channel) : 'Takeaway'}</span>
                </div>
                <div className="text-sm">{order.customer_name || order.customer_phone || order.channel_ref || '—'}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatCurrency(orderValue(lines) + order.delivery_fee)}</span>
                  <span>{minutesSince(order.opened_at)} min</span>
                </div>
                {ready && <div className="mt-1 text-xs font-black text-emerald-600">Ready for pickup</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
