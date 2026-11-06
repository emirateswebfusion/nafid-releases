import { useState } from 'react';
import { ArrowRightLeft, Ban, Bike, ChefHat, Pencil, Receipt, ScrollText, Scissors, ShoppingBag, Undo2, UserRound, Users, UtensilsCrossed, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../../ui/Button';
import type { Product } from '../../../data/products';
import type { DiningTable, DraftLine, RestaurantOrder } from '../../../data/restaurant';
import { formatCurrency } from '../../../utils/pricing/money';
import { menuUnitPrice, minutesSince, orderValue, serviceChargeAmount } from '../restaurantRules';
import { getStoreVatInclusive } from '../../../utils/localization/storeProfile';
import { channelStyle, formatElapsed } from '../ui/restaurantStyle';
import type { RestaurantData } from '../hooks/useRestaurantData';
import type { OrderActions } from '../hooks/useOrderActions';
import { MenuGrid } from './MenuGrid';
import { OrderTicketView } from './OrderTicketView';
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
  /** Unsent items of this order; kept by the page so they survive leaving the order screen. */
  drafts: DraftLine[];
  setDrafts: (update: (prev: DraftLine[]) => DraftLine[]) => void;
}

type Dialog = null | 'void' | 'split' | 'cancel' | 'transfer' | 'details';

/** One open order: menu (category rail + tiles) on the left, the order ticket with totals and actions on the right. */
export function OrderPanel({ order, data, actions, can, onBack, onSelectOrder, drafts, setDrafts }: OrderPanelProps) {
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
  const applyServiceCharge = guestAgreed;
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
    setPicking(product);
  };

  const send = async () => {
    const ok = await actions.sendItems(order, drafts.map(({ key: _key, ...line }) => line));
    if (ok) setDrafts(() => []);
  };

  const menu = data.products.filter(p => !Number(p.is_service_item) || p.category);
  const draftCounts = drafts.reduce<Record<string, number>>((acc, d) => { acc[d.product_id] = (acc[d.product_id] ?? 0) + d.quantity; return acc; }, {});
  const draftQty = drafts.reduce((s, d) => s + d.quantity, 0);
  const itemsValue = orderValue(lines) + draftValue;
  const charge = applyServiceCharge ? serviceChargeAmount(itemsValue, data.serviceCharge, order.order_type) : 0;
  const askCharge = !locked && serviceChargeAmount(itemsValue, data.serviceCharge, order.order_type) > 0;
  const title = order.order_type === 'DINE_IN' ? `Table ${table?.label ?? '?'}` : order.order_type === 'DELIVERY' ? 'Delivery' : 'Takeaway';
  const Icon = order.order_type === 'DINE_IN' ? UtensilsCrossed : order.order_type === 'DELIVERY' ? Bike : ShoppingBag;
  const channel = channelStyle(order.channel);
  const tableBills = [order, ...siblings].sort((a, b) => a.opened_at.localeCompare(b.opened_at));
  const nothingActive = lines.every(l => l.status !== 'ACTIVE');
  const secondary = (label: string, Ic: typeof Ban, onClick: () => void, disabled = false, danger = false) => (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-bold transition active:scale-95 disabled:pointer-events-none disabled:opacity-40 ${danger ? 'border-rose-500/30 text-rose-600 hover:bg-rose-500/10' : 'border-border text-foreground hover:bg-muted'}`}>
      <Ic className="h-4 w-4" />{label}
    </button>
  );

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 sm:p-6 xl:h-full xl:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {tableBills.length > 1 && <div className="flex flex-wrap items-center gap-2">
          {tableBills.length > 1 && (
            <div className="flex rounded-xl border border-border bg-card p-1">
              {tableBills.map((b, i) => (
                <button key={b.order_id} type="button" onClick={() => onSelectOrder(b.order_id)}
                  className={`rounded-lg px-3 py-1 text-sm font-bold ${b.order_id === order.order_id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Bill {i + 1}</button>
              ))}
            </div>
          )}
        </div>}
        {locked ? (
          <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="rounded-3xl bg-amber-500/15 p-5 text-amber-600"><Receipt className="h-10 w-10" /></div>
            <h2 className="text-lg font-black">Being billed</h2>
            <p className="text-sm text-muted-foreground">This order is open in Billing{order.billing_terminal && order.billing_terminal !== data.active.terminal ? ' on another terminal' : ''}. Reopen it to add items.</p>
            <Button disabled={actions.working} className="mt-3 min-h-14 w-full max-w-xs justify-center rounded-2xl px-8 py-4 text-base font-bold shadow-sm" onClick={() => void actions.releaseClaim(order)}><Undo2 className="mr-2 h-5 w-5" />{actions.working ? 'Reopening…' : 'Reopen order'}</Button>
          </div>
        ) : <MenuGrid onBack={onBack} backLabel={order.order_type === 'DINE_IN' ? 'Back to Tables' : 'Back to Orders'} products={menu} modifierGroups={[]} draftCounts={draftCounts} onPick={pick} />}
      </div>

      <aside className="flex w-full xl:w-[380px] xl:shrink-0 min-h-0 flex-col overflow-hidden rounded-[20px] border border-border bg-card shadow-sm">
        <div className="border-b border-border/70 bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/10 p-2.5 text-primary"><Icon className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-xl font-black leading-tight">{title}</div>
              <div className="text-xs font-semibold text-muted-foreground">Order {order.order_no} · {formatElapsed(minutesSince(order.opened_at))}</div>
            </div>
            <button type="button" onClick={() => setDialog('details')} disabled={locked || !can('restaurant.orders')} title={locked ? 'Reopen this order before editing details' : 'Edit order details'}
              className="rounded-xl border border-border bg-card p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"><Pencil className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
            {order.covers > 0 && <span className="flex items-center gap-1 rounded-full bg-background px-2 py-0.5"><Users className="h-3 w-3" />{order.covers} guests</span>}
            {order.waiter_name && <span className="flex items-center gap-1 rounded-full bg-background px-2 py-0.5"><UserRound className="h-3 w-3" />{order.waiter_name}</span>}
            {order.customer_name && <span className="rounded-full bg-background px-2 py-0.5">{order.customer_name}</span>}
            {order.customer_phone && <span className="rounded-full bg-background px-2 py-0.5">{order.customer_phone}</span>}
            {order.order_type === 'DELIVERY' && <span className={`rounded-full border px-2 py-0.5 ${channel.className}`}>{channel.label}{order.channel_ref ? ` · ${order.channel_ref}` : ''}</span>}
          </div>
          {order.note && <div className="mt-2 rounded-xl bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">Note: {order.note}</div>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <OrderTicketView lines={lines} kots={kots} drafts={drafts}
            onDraftQty={(key, delta) => setDrafts(prev => prev.map(d => d.key === key ? { ...d, quantity: d.quantity + delta } : d).filter(d => d.quantity > 0))}
            onDraftRemove={key => setDrafts(prev => prev.filter(d => d.key !== key))}
            onReprint={kotId => void actions.reprint(kotId)} />
        </div>

        <div className="space-y-3 border-t border-border/70 bg-muted/20 p-4">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Items</span><span className="tabular-nums">{formatCurrency(itemsValue)}</span></div>
            {charge > 0 && <div className="flex justify-between text-muted-foreground"><span>{data.serviceCharge.label} {data.serviceCharge.percent}%</span><span className="tabular-nums">{formatCurrency(charge)}</span></div>}
            {order.delivery_fee > 0 && <div className="flex justify-between text-muted-foreground"><span>Delivery fee</span><span className="tabular-nums">{formatCurrency(order.delivery_fee)}</span></div>}
            <div className="flex items-baseline justify-between pt-1">
              <span className="font-bold">Total</span>
              <span className="text-2xl font-black tabular-nums">{formatCurrency(itemsValue + charge + order.delivery_fee)}</span>
            </div>
            <div className="text-right text-[10px] text-muted-foreground">{getStoreVatInclusive() ? 'Prices include tax' : 'Tax is added on the bill'}</div>
          </div>
          {askCharge && (
            <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold">
              <input type="checkbox" checked={guestAgreed} onChange={e => setGuestAgreed(e.target.checked)} />
              Add {data.serviceCharge.label.toLowerCase()} {data.serviceCharge.percent}% (guest agreed)
            </label>
          )}
          {!locked && (draftQty > 0 ? (
            <Button className="h-12 w-full text-base" disabled={actions.working} onClick={() => void send()}>
              <ChefHat className="mr-2 h-5 w-5" />Send to kitchen · {draftQty} item{draftQty === 1 ? '' : 's'}
            </Button>
          ) : (
            <Button className="h-12 w-full text-base" disabled={actions.working || nothingActive}
              onClick={() => void actions.billOrder(order, lines, applyServiceCharge)}><Receipt className="mr-2 h-5 w-5" />Bill & take payment</Button>
          ))}
          {!locked && (
            <div className="grid grid-cols-5 gap-1.5">
              {secondary('Guest check', ScrollText, () => void actions.printGuestCheck(order, lines, applyServiceCharge), actions.working || nothingActive)}
              {secondary('Void', Ban, () => setDialog('void'), !can('restaurant.void') || nothingActive)}
              {secondary('Split', Scissors, () => setDialog('split'), !can('restaurant.transfer') || nothingActive)}
              {secondary(order.order_type === 'DINE_IN' ? 'Move' : 'Merge', ArrowRightLeft, () => setDialog('transfer'), !can('restaurant.transfer'))}
              {secondary('Cancel', X, () => setDialog('cancel'), !can('restaurant.void') && !nothingActive, true)}
            </div>
          )}
        </div>
      </aside>

      {picking && (
        <ModifierPicker product={picking} groups={[]} modifiers={[]}
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
          onCancel={() => setDialog(null)} onSave={async fields => { const saved = await actions.updateOrder(order, fields); if (saved) { await data.refreshOrders(); setDialog(null); } return !!saved; }} />
      )}
    </div>
  );
}
