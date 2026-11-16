import { Bike, ChefHat, CircleCheck, Clock, MapPin, Phone, Plus, QrCode, ScrollText, ShoppingBag } from 'lucide-react';
import type { ActiveOrders, OrderType, RestaurantOrder } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';
import { minutesSince, orderValue } from '../restaurantRules';
import { ageTone, channelStyle, formatElapsed } from '../ui/restaurantStyle';

interface TokenOrdersViewProps {
  active: ActiveOrders;
  billedOrderIds?: string[] | Record<string, boolean>;
  onNew: (type: OrderType) => void;
  onOpenOrder: (order: RestaurantOrder) => void;
  onShowDeliveryQr?: () => void;
}

/** Kitchen progress of an order from its tickets: nothing sent, cooking, or all ready. */
function kitchenState(order: RestaurantOrder, active: ActiveOrders): 'none' | 'cooking' | 'ready' {
  const kots = active.kots.filter(k => k.order_id === order.order_id && k.kind === 'NEW');
  if (kots.length === 0) return 'none';
  return kots.every(k => k.kds_status === 'READY' || k.kds_status === 'SERVED') ? 'ready' : 'cooking';
}

function OrderCard({ order, active, billedOrderIds, onOpenOrder }: { order: RestaurantOrder; active: ActiveOrders; billedOrderIds?: string[] | Record<string, boolean>; onOpenOrder: (o: RestaurantOrder) => void }) {
  const lines = active.lines.filter(l => l.order_id === order.order_id && l.status === 'ACTIVE');
  const minutes = minutesSince(order.opened_at);
  const kitchen = kitchenState(order, active);
  const channel = channelStyle(order.channel);
  const items = lines.reduce((s, l) => s + l.quantity, 0);
  const isBilled = billedOrderIds && (Array.isArray(billedOrderIds) ? billedOrderIds.includes(order.order_id) : Boolean(billedOrderIds[order.order_id]));
  return (
    <button type="button" onClick={() => onOpenOrder(order)}
      className={`flex w-full flex-col gap-2 rounded-2xl border-2 bg-card p-4 text-left shadow-sm transition-all active:scale-[0.98] ${order.status === 'BILLING' ? 'border-amber-500/60' : isBilled ? 'border-indigo-500/60' : kitchen === 'ready' ? 'border-emerald-500/60' : 'border-border hover:border-primary/50'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Token</div>
          <div className="text-2xl font-black leading-none">{order.order_no}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {order.order_type === 'DELIVERY' && (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${channel.className}`}>{channel.label}{order.channel_ref ? ` · ${order.channel_ref}` : ''}</span>
          )}
          <span className={`flex items-center gap-1 text-xs font-semibold ${ageTone(minutes, 15, 30)}`}><Clock className="h-3 w-3" />{formatElapsed(minutes)}</span>
        </div>
      </div>
      {(order.customer_name || order.customer_phone) && (
        <div className="flex flex-wrap gap-x-3 text-sm">
          {order.customer_name && <span className="font-bold">{order.customer_name}</span>}
          {order.customer_phone && <span className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" />{order.customer_phone}</span>}
        </div>
      )}
      {order.order_type === 'DELIVERY' && order.delivery_address && (
        <div className="flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span className="line-clamp-2">{order.delivery_address}</span></div>
      )}
      <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-2 text-sm">
        <span className="text-muted-foreground">{items} item{items === 1 ? '' : 's'}</span>
        <span className="font-black tabular-nums">{formatCurrency(orderValue(lines) + order.delivery_fee)}</span>
      </div>
      <div className="text-xs font-bold">
        {order.status === 'BILLING' ? <span className="text-amber-600">In payment…</span>
          : isBilled ? <span className="flex items-center gap-1 text-indigo-600"><ScrollText className="h-3.5 w-3.5" />Bill printed · awaiting payment</span>
          : kitchen === 'ready' ? <span className="flex items-center gap-1 text-emerald-600"><CircleCheck className="h-3.5 w-3.5" />Ready for {order.order_type === 'DELIVERY' ? 'pickup by rider' : 'the customer'}</span>
            : kitchen === 'cooking' ? <span className="flex items-center gap-1 text-sky-600"><ChefHat className="h-3.5 w-3.5" />In the kitchen</span>
              : <span className="text-muted-foreground">Not sent to the kitchen yet</span>}
      </div>
    </button>
  );
}

/** Board of takeaway and delivery orders, one column each, oldest first. */
export function TokenOrdersView({ active, billedOrderIds, onNew, onOpenOrder, onShowDeliveryQr }: TokenOrdersViewProps) {
  const column = (type: OrderType, title: string, Icon: typeof Bike) => {
    const orders = active.orders.filter(o => o.order_type === type);
    return (
      <section className="flex min-h-0 flex-col rounded-[20px] border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><Icon className="h-4 w-4 text-primary" />{title}<span className="rounded-full bg-primary/10 px-2 text-primary">{orders.length}</span></h2>
          <div className="flex items-center gap-1.5">
            {type === 'DELIVERY' && onShowDeliveryQr && (
              <button
                type="button"
                onClick={onShowDeliveryQr}
                className="flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 active:scale-95"
                title="Share Home Delivery QR & WhatsApp Menu"
              >
                <QrCode className="h-3.5 w-3.5" />
                Delivery QR
              </button>
            )}
            <button type="button" onClick={() => onNew(type)} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground active:scale-95"><Plus className="h-3.5 w-3.5" />New</button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3 overflow-y-auto">
          {orders.map(o => <OrderCard key={o.order_id} order={o} active={active} billedOrderIds={billedOrderIds} onOpenOrder={onOpenOrder} />)}
          {orders.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-border bg-muted/20 px-5 py-12 text-center text-sm text-muted-foreground">No open {title.toLowerCase()} orders</div>}
        </div>
      </section>
    );
  };
  return (
    <div className="grid min-h-full grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-2">
      {column('TAKEAWAY', 'Takeaway', ShoppingBag)}
      {column('DELIVERY', 'Delivery', Bike)}
    </div>
  );
}
