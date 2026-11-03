import { useState } from 'react';
import { ArrowLeft, ArrowRightLeft, Ban, ChefHat, Pencil, Receipt, ScrollText, Scissors, Undo2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../../ui/Button';
import type { Product } from '../../../data/products';
import type { DiningTable, RestaurantOrder } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';
import { groupsForProduct, menuUnitPrice, orderValue, serviceChargeAmount, serviceChargeMode } from '../restaurantRules';
import { isUaeStore } from '../../../utils/localization/storeProfile';
import type { RestaurantData } from '../hooks/useRestaurantData';
import type { OrderActions } from '../hooks/useOrderActions';
import { MenuGrid } from './MenuGrid';
import { OrderTicketView, type DraftLine } from './OrderTicketView';
import { ModifierPicker } from '../modals/ModifierPicker';
import { LinePickDialog } from '../modals/LinePickDialog';
import { TransferDialog } from '../modals/TransferDialog';
import { OrderDetailsDialog } from '../modals/OrderDetailsDialog';

interface OrderPanelProps {
  order: RestaurantOrder;
  data: RestaurantData;
  actions: OrderActions;
  can: (permission: string) => boolean;
  onBack: () => void;
  onSelectOrder: (orderId: string) => void;
}

type Dialog = null | 'void' | 'split' | 'cancel' | 'transfer' | 'details';

/** One open order: menu on the left, ticket and actions on the right. */
export function OrderPanel({ order, data, actions, can, onBack, onSelectOrder }: OrderPanelProps) {
  const [drafts, setDrafts] = useState<DraftLine[]>([]);
  const [picking, setPicking] = useState<Product | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  // India: the service charge is added only when the guest agrees (restaurantRules.serviceChargeMode).
  const [guestAgreed, setGuestAgreed] = useState(false);
  const lines = data.active.lines.filter(l => l.order_id === order.order_id);
  // A split bill's items keep the parent order's kitchen tickets, so tickets are looked up across open orders.
  const kots = data.active.kots;
  const table: DiningTable | undefined = data.setup.tables.find(t => t.table_id === order.table_id);
  const siblings = data.active.orders.filter(o => o.order_id !== order.order_id && o.table_id && o.table_id === order.table_id);
  const locked = order.status === 'BILLING';
  const applyServiceCharge = serviceChargeMode(isUaeStore()) === 'automatic' || guestAgreed;
  const draftValue = drafts.reduce((s, d) => s + d.quantity * (d.unit_price + d.modifiers.reduce((m, x) => m + x.price, 0)), 0);

  const addDraft = (product: Product, choice: { quantity: number; modifiers: DraftLine['modifiers']; note: string | null; seat: number | null }) => {
    setDrafts(prev => {
      const plain = choice.modifiers.length === 0 && !choice.note && !choice.seat;
      const same = plain ? prev.find(d => d.product_id === product.product_id && d.modifiers.length === 0 && !d.note && !d.seat) : undefined;
      if (same) return prev.map(d => d.key === same.key ? { ...d, quantity: d.quantity + choice.quantity } : d);
      return [...prev, {
        key: uuidv4(), product_id: product.product_id, name: product.name, category: product.category ?? null,
        quantity: choice.quantity, unit_price: menuUnitPrice(product), tax_rate: Number(product.tax_rate_percent ?? 0),
        modifiers: choice.modifiers, note: choice.note, seat: choice.seat,
      }];
    });
  };

  const pick = (product: Product) => {
    if (locked) return;
    if (groupsForProduct(product, data.setup.modifierGroups).length > 0) setPicking(product);
    else addDraft(product, { quantity: 1, modifiers: [], note: null, seat: null });
  };

  const send = async () => {
    const ok = await actions.sendItems(order, drafts.map(({ key: _key, ...line }) => line));
    if (ok) setDrafts([]);
  };

  const header = order.order_type === 'DINE_IN' ? `Table ${table?.label ?? '?'}` : order.order_type === 'DELIVERY' ? 'Delivery' : 'Takeaway';

  return (
    <div className="flex h-full min-h-0 gap-4 p-4">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Floor</Button>
          {siblings.map(s => (
            <Button key={s.order_id} size="sm" variant="outline" onClick={() => onSelectOrder(s.order_id)}>Bill {s.order_no}</Button>
          ))}
        </div>
        {locked
          ? <div className="m-auto max-w-sm text-center text-sm text-muted-foreground">This order is being billed{order.billing_terminal && order.billing_terminal !== data.active.terminal ? ' on another terminal' : ''}. Reopen it to add items.</div>
          : <MenuGrid products={data.products} onPick={pick} />}
      </div>
      <aside className="flex w-[380px] min-h-0 flex-col rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-black">{header} <span className="text-muted-foreground">#{order.order_no}</span></div>
              <div className="text-xs text-muted-foreground">
                {[order.covers ? `${order.covers} guests` : '', order.waiter_name, order.customer_name, order.customer_phone,
                  order.channel !== 'OWN' ? `${order.channel} ${order.channel_ref ?? ''}` : ''].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setDialog('details')} disabled={locked}><Pencil className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <OrderTicketView lines={lines} kots={kots} drafts={drafts}
            onDraftQty={(key, delta) => setDrafts(prev => prev.map(d => d.key === key ? { ...d, quantity: d.quantity + delta } : d).filter(d => d.quantity > 0))}
            onDraftRemove={key => setDrafts(prev => prev.filter(d => d.key !== key))}
            onReprint={kotId => void actions.reprint(kotId)} />
        </div>
        <div className="space-y-2 border-t border-border p-3">
          <div className="flex justify-between text-sm"><span>Order value</span><span className="font-black">{formatCurrency(orderValue(lines) + draftValue + order.delivery_fee)}</span></div>
          {drafts.length > 0 && (
            <Button className="w-full" disabled={actions.working} onClick={() => void send()}>
              <ChefHat className="mr-2 h-4 w-4" />Send to kitchen ({drafts.reduce((s, d) => s + d.quantity, 0)})
            </Button>
          )}
          {!locked && serviceChargeMode(isUaeStore()) === 'ask' && serviceChargeAmount(orderValue(lines), data.serviceCharge, order.order_type) > 0 && (
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={guestAgreed} onChange={e => setGuestAgreed(e.target.checked)} />
              Add {data.serviceCharge.label.toLowerCase()} {data.serviceCharge.percent}% (guest agreed)
            </label>
          )}
          {locked ? (
            <Button className="w-full" variant="outline" onClick={() => void actions.releaseClaim(order)}><Undo2 className="mr-2 h-4 w-4" />Reopen order</Button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={actions.working} onClick={() => void actions.printGuestCheck(order, lines, applyServiceCharge)}><ScrollText className="mr-1 h-4 w-4" />Guest check</Button>
                <Button disabled={actions.working || drafts.length > 0} title={drafts.length > 0 ? 'Send or remove unsent items first' : undefined}
                  onClick={() => void actions.billOrder(order, lines, applyServiceCharge)}><Receipt className="mr-1 h-4 w-4" />Bill</Button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Button size="sm" variant="outline" disabled={!can('restaurant.void')} onClick={() => setDialog('void')} title="Void items"><Ban className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" disabled={!can('restaurant.transfer')} onClick={() => setDialog('split')} title="Split bill"><Scissors className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" disabled={!can('restaurant.transfer')} onClick={() => setDialog('transfer')} title="Move / merge"><ArrowRightLeft className="h-4 w-4" /></Button>
                <Button size="sm" variant="destructive" disabled={!can('restaurant.void') && lines.some(l => l.status === 'ACTIVE')} onClick={() => setDialog('cancel')} title="Cancel order">✕</Button>
              </div>
            </>
          )}
        </div>
      </aside>

      {picking && (
        <ModifierPicker product={picking} groups={groupsForProduct(picking, data.setup.modifierGroups)} modifiers={data.setup.modifiers}
          onCancel={() => setPicking(null)} onConfirm={choice => { addDraft(picking, choice); setPicking(null); }} />
      )}
      {(dialog === 'void' || dialog === 'split' || dialog === 'cancel') && (
        <LinePickDialog mode={dialog} lines={lines} onCancel={() => setDialog(null)} onConfirm={async (parts, reason) => {
          setDialog(null);
          if (dialog === 'void') await actions.voidLines(order, parts, reason);
          else if (dialog === 'cancel') { if (await actions.cancelOrder(order, reason)) onBack(); }
          else { const child = await actions.splitOrder(order, parts); if (child) onSelectOrder(child); }
        }} />
      )}
      {dialog === 'transfer' && (
        <TransferDialog order={order} tables={data.setup.tables} openOrders={data.active.orders} onCancel={() => setDialog(null)}
          onMove={async t => { setDialog(null); await actions.moveTable(order, t.table_id); }}
          onMerge={async target => { setDialog(null); if (await actions.mergeOrders(target, order)) onSelectOrder(target.order_id); }} />
      )}
      {dialog === 'details' && (
        <OrderDetailsDialog title={`Order ${order.order_no}`} orderType={order.order_type} order={order} staff={data.staff}
          onCancel={() => setDialog(null)} onSave={async fields => { setDialog(null); await actions.updateOrder(order, fields); }} />
      )}
    </div>
  );
}
