import { storeDate } from '../../../utils/time/dateDisplay';
import { Search, RefreshCw, ShoppingCart } from 'lucide-react';
import clsx from 'clsx';
import { getStoreProfile } from '../../../utils/localization/storeProfile';
import { formatCurrency } from '../../../utils/pricing/money';
import type { EcommerceOrder } from '../../../services/fusionCartService';
import type { EcommerceState } from '../hooks/useEcommerceState';

export interface EcomOrdersTabProps {
  filteredOrders: EcommerceOrder[];
  loadOrders: () => Promise<void>;
  ec: EcommerceState;
}

/** Orders tab: online orders stream with status actions. */
export function EcomOrdersTab({
  filteredOrders, loadOrders, ec,
}: EcomOrdersTabProps) {
  const { orderSearch, ordersLoading, orderStatusFilter, setOrderSearch, setOrderStatusFilter, setSelectedOrder, settings } = ec;
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-foreground">FusionCart Real-Time Orders Stream</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Online customer orders dispatched to Store #{settings?.store_id || '0'} for fulfillment.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value)}
              placeholder="Search order #, customer..."
              className="bg-background border border-border/80 rounded-xl pl-8.5 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary shadow-2xs"
            />
          </div>

          <select
            value={orderStatusFilter}
            onChange={e => setOrderStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-border/80 bg-background text-xs font-semibold text-foreground cursor-pointer focus:outline-none focus:border-primary shadow-2xs"
          >
            <option value="all">All Payments</option>
            <option value="completed">Paid / Completed</option>
            <option value="pending">Payment Pending</option>
          </select>

          <button
            onClick={loadOrders}
            disabled={ordersLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/80 bg-card text-xs font-bold hover:bg-muted text-foreground transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", ordersLoading && "animate-spin text-primary")} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-bold sticky top-0 backdrop-blur-xs select-none">
              <tr>
                <th className="px-3 py-2">Order #</th>
                <th className="px-3 py-2">Order Date</th>
                <th className="px-3 py-2">Customer Destination</th>
                <th className="px-3 py-2 text-center">Items</th>
                <th className="px-3 py-2 text-right">Total ({getStoreProfile().currency})</th>
                <th className="px-3 py-2 text-center">Payment Status</th>
                <th className="px-3 py-2 text-center">Fulfillment</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {ordersLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                    <span className="font-semibold text-xs">Streaming orders from FusionCart engine...</span>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="font-bold text-sm text-foreground">No online orders recorded yet</p>
                    <p className="text-xs text-muted-foreground mt-1">When marketplace shoppers place orders, they will stream directly into this POS table in real-time.</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono font-bold text-primary">
                      #{order.order_number || order.id}
                    </td>

                    <td className="px-3 py-2 text-muted-foreground font-medium">
                      {order.created_at ? storeDate(order.created_at, 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent'}
                    </td>

                    <td className="px-3 py-2">
                      <div className="font-bold text-foreground">
                        {order.billing_address?.title || 'Online Customer'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {order.shipping_address?.city || order.billing_address?.city || 'United Arab Emirates'}
                      </div>
                    </td>

                    <td className="px-3 py-2 text-center font-mono">
                      <span className="px-2 py-0.5 rounded-md bg-muted/60 text-[10px] font-bold">
                        {order.products?.length || 0} items
                      </span>
                    </td>

                    <td className="px-3 py-2 text-right font-mono font-black text-foreground">
                      {formatCurrency(order.total || order.amount)}
                    </td>

                    <td className="px-3 py-2 text-center">
                      <span className={clsx(
                        "inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                        order.payment_status === 'COMPLETED' || order.payment_status === 'PAID'
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      )}>
                        {order.payment_status || 'PENDING'}
                      </span>
                    </td>

                    <td className="px-3 py-2 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-secondary text-secondary-foreground text-[10px] font-bold uppercase border border-border/50">
                        {order.order_status?.name || 'Processing'}
                      </span>
                    </td>

                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="px-3 py-1 rounded-xl border border-border/80 hover:bg-muted text-[11px] font-bold text-foreground transition-all cursor-pointer shadow-2xs"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
