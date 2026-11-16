import { useEffect, useState, useCallback } from 'react';
import { Check, Clock, RefreshCw, ShoppingBag, X, Smartphone, AlertCircle } from 'lucide-react';
import { Button } from '../../ui/Button';
import { restaurantApi, type PendingOnlineOrder } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';
import { minutesSince } from '../restaurantRules';

interface OnlineOrdersViewProps {
  tenantId: string;
  userId: string | null;
  onOrderAccepted?: (orderId: string) => void;
}

export function OnlineOrdersView({ tenantId, userId, onOrderAccepted }: OnlineOrdersViewProps) {
  const [orders, setOrders] = useState<PendingOnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const loadPending = useCallback(async () => {
    try {
      const res = await restaurantApi.listPendingOnlineOrders({ tenant_id: tenantId });
      if (res && res.success && Array.isArray(res.orders)) {
        setOrders(res.orders);
      }
    } catch (err) {
      console.error('Failed to load pending online orders:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    const first = window.setTimeout(() => void loadPending(), 0);
    const interval = window.setInterval(() => void loadPending(), 8000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [loadPending]);

  const handleAccept = async (order: PendingOnlineOrder) => {
    setActingId(order.order_id);
    setMessage(null);
    try {
      const res = await restaurantApi.acceptOnlineOrder({
        order_id: order.order_id,
        user_id: userId,
      });

      if (res && res.success) {
        setMessage({ tone: 'ok', text: `Order #${order.order_no} accepted and sent to kitchen!` });
        await loadPending();
        onOrderAccepted?.(order.order_id);
      } else {
        setMessage({ tone: 'err', text: res && !res.success ? res.error : 'Failed to accept order.' });
      }
    } catch {
      setMessage({ tone: 'err', text: 'Error accepting order.' });
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (order: PendingOnlineOrder) => {
    const reason = window.prompt(`Reject order #${order.order_no}? Enter reason:`, 'Item out of stock / Kitchen busy');
    if (!reason) return;

    setActingId(order.order_id);
    setMessage(null);
    try {
      const res = await restaurantApi.rejectOnlineOrder({
        order_id: order.order_id,
        reason,
      });

      if (res && res.success) {
        setMessage({ tone: 'ok', text: `Order #${order.order_no} rejected.` });
        await loadPending();
      } else {
        setMessage({ tone: 'err', text: res && !res.success ? res.error : 'Failed to reject order.' });
      }
    } catch {
      setMessage({ tone: 'err', text: 'Error rejecting order.' });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black">Incoming Online Food Orders</h2>
            <p className="text-xs text-muted-foreground">Orders placed by customers via WhatsApp / QR Menu</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={loadPending} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {message && (
        <div className={`flex items-center gap-2 rounded-xl p-3 text-xs font-bold ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
          <AlertCircle className="h-4 w-4" />
          <span>{message.text}</span>
        </div>
      )}

      {loading && orders.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="mx-auto my-12 flex max-w-sm flex-col items-center gap-3 p-8 text-center rounded-2xl border border-dashed border-border">
          <div className="rounded-2xl bg-primary/10 p-4 text-primary">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <h3 className="text-sm font-bold">No Pending Online Orders</h3>
          <p className="text-xs text-muted-foreground">
            When guests order from their smartphones via QR code or WhatsApp, new orders will automatically appear here for acceptance.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orders.map(order => {
            const minutes = minutesSince(order.opened_at);
            const total = order.lines.reduce((s, l) => s + l.quantity * l.unit_price, order.delivery_fee || 0);

            return (
              <div key={order.order_id} className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm hover:border-primary/40 transition-all">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black">{order.order_no}</span>
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 border border-amber-500/20">
                          Pending Approval
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        {order.order_type === 'DELIVERY' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 border border-blue-500/20">
                            🛵 Delivery
                          </span>
                        ) : order.order_type === 'TAKEAWAY' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-bold text-purple-600 border border-purple-500/20">
                            🛍️ Takeaway
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-500/20">
                            🍽️ Dine In
                          </span>
                        )}
                        {order.customer_name ? ` · ${order.customer_name}` : ''}
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {minutes}m ago
                    </span>
                  </div>

                  {order.customer_phone && (
                    <div className="text-xs text-muted-foreground">
                      📞 <span className="font-mono">{order.customer_phone}</span>
                    </div>
                  )}

                  {order.delivery_address && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                      <span className="font-bold flex items-center gap-1 mb-0.5">
                        🛵 Delivery Address:
                      </span>
                      <span>{order.delivery_address}</span>
                    </div>
                  )}

                  {order.note && (
                    <div className="rounded-xl bg-muted/40 p-2 text-xs italic text-foreground">
                      "{order.note}"
                    </div>
                  )}

                  <div className="divide-y divide-border/40 rounded-xl bg-background/50 border border-border/50 p-2 text-xs">
                    {order.lines.map(line => (
                      <div key={line.line_id} className="py-1 flex justify-between">
                        <span>
                          <b className="text-primary">{line.quantity}×</b> {line.name}
                          {line.note ? <span className="text-muted-foreground ml-1">({line.note})</span> : ''}
                        </span>
                        <span className="tabular-nums font-semibold">{formatCurrency(line.quantity * line.unit_price)}</span>
                      </div>
                    ))}
                    {order.delivery_fee > 0 && (
                      <div className="py-1 flex justify-between text-muted-foreground">
                        <span>Delivery Fee</span>
                        <span className="tabular-nums font-semibold">{formatCurrency(order.delivery_fee)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Total Amount</span>
                    <span className="text-lg font-black tabular-nums text-foreground">{formatCurrency(total)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(order)}
                      disabled={actingId === order.order_id}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAccept(order)}
                      disabled={actingId === order.order_id}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Accept & Send KOT
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
