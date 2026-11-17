import { useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, Loader2, QrCode, RotateCcw, Search, ShoppingBasket, XCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { formatCurrency } from '../../utils/pricing/money';
import type { ScanGoCart } from '../../data/cloud/scanGo';
import { isOpenCart, minutesLeft, STATUS_LABEL } from './scanGoRules';
import type { CustomerCartsState } from './useCustomerCarts';

interface Props {
  state: CustomerCartsState;
  isAdmin: boolean;
  onClose: () => void;
}

function CartRow({ cart, state, onOpened }: { cart: ScanGoCart; state: CustomerCartsState; onOpened: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const busy = state.busyId === cart.id;
  const open = isOpenCart(cart);
  const left = minutesLeft(cart);

  return (
    <div className={clsx('rounded-2xl border p-4 transition-colors', open ? 'border-border bg-card' : 'border-border/50 bg-muted/30 opacity-80')}>
      <div className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl bg-primary/10 px-3 py-2 text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ticket</div>
          <div className="font-mono text-xl font-black tracking-[0.2em] text-primary">{cart.ticket_code}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-base font-bold text-foreground">{cart.customer_name || 'Customer'}</span>
            <span className="text-sm text-muted-foreground">{cart.customer_phone}</span>
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {cart.item_count} {cart.item_count === 1 ? 'item' : 'items'} · about {formatCurrency(cart.subtotal)}
            {' · '}
            <span className={clsx(cart.status === 'PENDING' && left !== null && left <= 5 && 'font-semibold text-amber-600')}>
              {cart.status === 'PENDING' && left !== null ? `${left} min left` : cart.status === 'CLAIMED' ? `With ${cart.claimed_by_name || 'a cashier'}` : STATUS_LABEL[cart.status]}
              {cart.status === 'COMPLETED' && cart.invoice_number ? ` (bill ${cart.invoice_number})` : ''}
              {cart.status === 'REJECTED' && cart.reject_reason ? `: ${cart.reject_reason}` : ''}
            </span>
          </div>
          <button type="button" onClick={() => setExpanded(v => !v)} className="mt-1 text-xs font-semibold text-primary hover:underline">
            {expanded ? 'Hide items' : 'Show items'}
          </button>
        </div>
        {open && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button size="sm" disabled={busy} onClick={async () => { if (await state.openInBill(cart)) onOpened(); }}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShoppingBasket className="mr-1.5 h-4 w-4" />}
              {cart.status === 'CLAIMED' ? 'Open bill again' : 'Open in bill'}
            </Button>
            <div className="flex gap-2">
              {cart.status === 'CLAIMED' && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void state.release(cart)} title="Put the cart back in the waiting list">
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Put back
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(v => !v)}>
                <XCircle className="mr-1.5 h-4 w-4" /> Reject
              </Button>
            </div>
          </div>
        )}
      </div>
      {rejecting && open && (
        <div className="mt-3 flex gap-2">
          <input
            autoFocus value={reason} maxLength={200} onChange={e => setReason(e.target.value)}
            placeholder="Reason the customer will see (optional)"
            className="h-9 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => { setRejecting(false); void state.reject(cart, reason); }}>Reject cart</Button>
        </div>
      )}
      {expanded && (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {cart.items.map(line => (
              <tr key={line.product_id} className="border-t border-border/40">
                <td className="py-1.5 pr-2 text-foreground">{line.name}{line.barcode ? <span className="ml-2 text-xs text-muted-foreground">{line.barcode}</span> : null}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{line.quantity} × {formatCurrency(line.unit_price)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{formatCurrency(line.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ShopQr({ state, isAdmin }: { state: CustomerCartsState; isAdmin: boolean }) {
  const config = state.config;
  if (!config) return null;
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-border bg-muted/20 p-4">
      {config.enabled && config.qr_svg ? (
        <img alt="Shop Scan & Go QR code" className="h-36 w-36 shrink-0 rounded-xl bg-white p-1" src={`data:image/svg+xml;utf8,${encodeURIComponent(config.qr_svg)}`} />
      ) : (
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground"><QrCode className="h-10 w-10" /></div>
      )}
      <div className="space-y-2 text-sm">
        <div className="font-bold text-foreground">{config.enabled ? 'Scan & Go is on' : 'Scan & Go is off'}</div>
        <p className="text-muted-foreground">
          {config.enabled
            ? 'Customers scan this QR with the Nafid app, scan their items and send the cart here. Print it or show it at the entrance.'
            : 'When it is on, customers can scan items on their phone and send the cart to this counter. Nothing is sold until you bill it here.'}
        </p>
        {isAdmin && (
          <p className="font-semibold text-foreground">Manage this in Settings → Scan & Go, then press Save Changes.</p>
        )}
      </div>
    </div>
  );
}

/** "Customer carts": the Scan & Go queue at the cash register. */
export function CustomerCartsPanel({ state, isAdmin, onClose }: Props) {
  const [ticket, setTicket] = useState('');
  const [showQr, setShowQr] = useState(false);
  const enabled = Boolean(state.config?.enabled);
  const openCarts = state.carts.filter(isOpenCart);
  const closedCarts = state.carts.filter(c => !isOpenCart(c));

  const lookUp = async () => {
    const cart = await state.findByTicket(ticket);
    if (!cart) return;
    setTicket('');
    if (await state.openInBill(cart)) onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title="Customer carts" className="max-w-3xl">
      <div className="space-y-4">
        {(showQr || !enabled) && <ShopQr state={state} isAdmin={isAdmin} />}
        {enabled && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={ticket} onChange={e => setTicket(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void lookUp(); }}
                placeholder="Type or scan the customer's ticket code"
                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <Button variant="outline" onClick={() => void state.refresh()} disabled={state.loading} title="Refresh">
              {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </Button>
            <Button variant="outline" onClick={() => setShowQr(v => !v)} title="Shop QR code"><QrCode className="h-4 w-4" /></Button>
          </div>
        )}
        {state.loadError && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.loadError}</p>}
        {enabled && openCarts.length === 0 && !state.loadError && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8" />
            <p className="text-sm">No customer is waiting. New carts appear here automatically.</p>
          </div>
        )}
        {openCarts.map(cart => <CartRow key={cart.id} cart={cart} state={state} onOpened={onClose} />)}
        {closedCarts.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Last hour</div>
            {closedCarts.map(cart => <CartRow key={cart.id} cart={cart} state={state} onOpened={onClose} />)}
          </div>
        )}
      </div>
    </Modal>
  );
}
