import { randomUUID } from 'crypto';
import { getDb } from '../db/localDb.js';
import type { Db } from '../db/statements/types.js';
import * as sql from '../db/statements/restaurant.js';
import { localDate } from './storeTime.js';
import { routeToStations, type KotStation } from './restaurantKot.js';
import { ORDER_TYPES, DELIVERY_CHANNELS, type KitchenStationRow, type KotTicketRow, type OrderLineRow, type OrderType,
  type RestaurantOrderRow, type Result } from './restaurantTypes.js';
import { asInput, failure, list, number, parseTextList, requiredText, text, RestaurantInputError,
  type Input } from './restaurantInput.js';

/**
 * Restaurant orders (docs/architecture/restaurant-mode-design.md): open orders per table / token, lines sent to the
 * kitchen as KOTs, voids, move / merge / split, cancel, the billing claim and settlement by checkout. Lines are
 * append-only: a change is a void plus new lines, so terminals adding to the same order never edit the same row.
 */

/** Thrown inside the checkout transaction when the order cannot be settled; checkout shows its message. */
export class RestaurantSettleError extends Error {}

/** A billing claim older than this may be taken over by another terminal. */
export const CLAIM_STALE_MS = 10 * 60 * 1000;

const MOVED = 'MOVED';

export function stationsOf(db: Db, tenantId: string): KotStation[] {
  return (sql.listKitchenStations(db).all(tenantId) as KitchenStationRow[]).map(s => ({
    station_id: s.station_id, name: s.name, categories: parseTextList(s.categories), is_default: s.is_default === 1,
  }));
}

/** Install id of this terminal (outbox origin): identifies who holds a billing claim. */
export function terminalId(db: Db): string {
  const row = sql.findTerminalOrigin(db).get() as { value: string } | undefined;
  return row?.value || 'local';
}

function terminalCode(db: Db, tenantId: string): string {
  const row = sql.findTerminalCode(db).get(tenantId) as { value: string } | undefined;
  let code: unknown = row?.value;
  if (typeof code === 'string') { try { code = JSON.parse(code); } catch { /* plain text value */ } }
  const clean = typeof code === 'string' ? code.trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 6) : '';
  return clean || terminalId(db).slice(0, 4).toUpperCase();
}

/** Daily operational number of this terminal: `<terminal>-<n>` (not a tax document; gaps are allowed). */
function nextNumber(db: Db, tenantId: string, businessDate: string, kind: 'ORDER' | 'KOT'): string {
  const row = sql.nextCounterValue(db).get(`${tenantId}:${businessDate}:${kind}`) as { value: number };
  return `${terminalCode(db, tenantId)}-${row.value}`;
}

function requireOrder(db: Db, orderId: string, statuses: readonly string[] = ['OPEN']): RestaurantOrderRow {
  const order = sql.findOrder(db).get(orderId) as RestaurantOrderRow | undefined;
  if (!order) throw new RestaurantInputError('Order not found');
  if (!statuses.includes(order.status)) {
    throw new RestaurantInputError(order.status === 'BILLING' ? 'The order is being billed' : `The order is ${order.status.toLowerCase()}`);
  }
  return order;
}

function triggerSync(): void {
  import('../sync/syncWorker.js').then(({ triggerUrgentInvoiceSync }) => triggerUrgentInvoiceSync())
    .catch(e => console.error('[restaurant] urgent sync error:', e));
}

interface NewLine {
  product_id: string; name: string; category: string | null; quantity: number; unit_price: number; tax_rate: number;
  modifiers: string; note: string | null; seat: number | null;
}

function parseLine(input: Input): NewLine {
  const quantity = number(input, 'quantity', 1, 0);
  if (quantity <= 0) throw new RestaurantInputError('Quantity must be more than zero');
  const modifiers = list(input, 'modifiers').map(m => ({
    modifier_id: requiredText(m, 'modifier_id'), name: requiredText(m, 'name'),
    price: number(m, 'price', 0, 0), tax_rate: number(m, 'tax_rate', 0, 0),
  }));
  const seat = text(input, 'seat');
  return {
    product_id: requiredText(input, 'product_id'), name: requiredText(input, 'name'), category: text(input, 'category'),
    quantity, unit_price: number(input, 'unit_price', 0, 0), tax_rate: number(input, 'tax_rate', 0, 0),
    modifiers: JSON.stringify(modifiers), note: text(input, 'note'), seat: seat ? Math.round(Number(seat)) || null : null,
  };
}

/** Inserts a copy of a line (same kitchen ticket) into `orderId`, optionally with another quantity. */
function copyLine(db: Db, line: OrderLineRow, orderId: string, quantity: number, userId: string | null): string {
  const lineId = randomUUID();
  sql.insertLine(db).run({
    line_id: lineId, tenant_id: line.tenant_id, order_id: orderId, product_id: line.product_id, name: line.name,
    category: line.category, quantity, unit_price: line.unit_price, tax_rate: line.tax_rate, modifiers: line.modifiers,
    note: line.note, seat: line.seat, station_id: line.station_id, kot_id: line.kot_id,
    moved_from_line_id: line.line_id, created_by: userId, created_at: line.created_at,
  });
  return lineId;
}

function insertKot(db: Db, order: RestaurantOrderRow, kind: 'NEW' | 'VOID', station: KotStation | null, userId: string | null, businessDate: string): string {
  const kotId = randomUUID();
  sql.insertKot(db).run({
    kot_id: kotId, tenant_id: order.tenant_id, order_id: order.order_id, kot_no: nextNumber(db, order.tenant_id, businessDate, 'KOT'),
    kind, station_id: station?.station_id ?? null, station_name: station?.name ?? 'Kitchen',
    kds_status: kind === 'VOID' ? 'SERVED' : 'NEW', created_by: userId, business_date: businessDate,
  });
  return kotId;
}

/** Voids lines (whole or part quantity) with a reason; prints one VOID ticket per station. Runs inside a transaction. */
function voidInTransaction(db: Db, order: RestaurantOrderRow, parts: { line: OrderLineRow; quantity: number }[], reason: string, userId: string | null): string[] {
  const businessDate = localDate(new Date(), order.tenant_id);
  const stations = stationsOf(db, order.tenant_id);
  const kotIds: string[] = [];
  const groups = routeToStations(parts.map(p => ({ ...p, category: p.line.category })), stations);
  for (const group of groups) {
    const station = stations.find(s => s.station_id === group.items[0].line.station_id) ?? group.station;
    const kotId = insertKot(db, order, 'VOID', station, userId, businessDate);
    kotIds.push(kotId);
    for (const { line, quantity } of group.items) {
      let target = line;
      if (quantity < line.quantity) {
        // Part void: replace the line by the kept and the voided quantity, then void the latter.
        sql.voidLine(db).run(MOVED, userId, null, line.line_id);
        copyLine(db, line, order.order_id, line.quantity - quantity, userId);
        target = { ...line, line_id: copyLine(db, line, order.order_id, quantity, userId), quantity };
      }
      sql.voidLine(db).run(reason, userId, kotId, target.line_id);
    }
  }
  return kotIds;
}

export interface ActiveOrders {
  orders: RestaurantOrderRow[];
  lines: OrderLineRow[];
  kots: KotTicketRow[];
  closedToday: RestaurantOrderRow[];
  terminal: string;
}

/** IPC `restaurant:listActive` — open orders with their lines and tickets, plus today's closed orders. */
export function listActive(payload: unknown): ActiveOrders {
  const tenantId = requiredText(asInput(payload), 'tenant_id');
  const db = getDb();
  return {
    orders: sql.listActiveOrders(db).all(tenantId) as RestaurantOrderRow[],
    lines: sql.listLinesOfActiveOrders(db).all(tenantId) as OrderLineRow[],
    kots: sql.listKotsOfActiveOrders(db).all(tenantId) as KotTicketRow[],
    closedToday: sql.listRecentClosedOrders(db).all(tenantId, localDate(new Date(), tenantId)) as RestaurantOrderRow[],
    terminal: terminalId(db),
  };
}

/** IPC `restaurant:getOrder` */
export function getOrder(payload: unknown): { order: RestaurantOrderRow | null; lines: OrderLineRow[]; kots: KotTicketRow[] } {
  const orderId = requiredText(asInput(payload), 'order_id');
  const db = getDb();
  return {
    order: (sql.findOrder(db).get(orderId) as RestaurantOrderRow | undefined) ?? null,
    lines: sql.listLinesOfOrder(db).all(orderId) as OrderLineRow[],
    kots: sql.listKotsOfOrder(db).all(orderId) as KotTicketRow[],
  };
}

function orderFields(input: Input) {
  const channel = (text(input, 'channel') ?? 'OWN').toUpperCase();
  if (!(DELIVERY_CHANNELS as readonly string[]).includes(channel)) throw new RestaurantInputError('Unknown delivery channel');
  return {
    covers: Math.round(number(input, 'covers', 0, 0)),
    waiter_user_id: text(input, 'waiter_user_id'),
    waiter_name: text(input, 'waiter_name'),
    customer_name: text(input, 'customer_name'),
    customer_phone: text(input, 'customer_phone'),
    delivery_address: text(input, 'delivery_address'),
    channel,
    channel_ref: text(input, 'channel_ref'),
    delivery_fee: number(input, 'delivery_fee', 0, 0),
    note: text(input, 'note'),
  };
}

/** IPC `restaurant:openOrder` — a dine-in order needs a free table; takeaway / delivery get a token number. */
export function openOrder(payload: unknown): Result<{ order: RestaurantOrderRow }> {
  try {
    const input = asInput(payload);
    const tenantId = requiredText(input, 'tenant_id');
    const orderType = requiredText(input, 'order_type').toUpperCase() as OrderType;
    if (!ORDER_TYPES.includes(orderType)) throw new RestaurantInputError('Unknown order type');
    const tableId = orderType === 'DINE_IN' ? requiredText(input, 'table_id') : null;
    const fields = orderFields(input);
    if (orderType === 'DELIVERY' && fields.channel === 'OWN' && !fields.customer_phone) {
      throw new RestaurantInputError('A delivery needs the customer phone');
    }
    const db = getDb();
    const orderId = randomUUID();
    db.transaction(() => {
      if (tableId) {
        if (!sql.findDiningTable(db).get(tableId)) throw new RestaurantInputError('Table not found');
        if (sql.findActiveOrderOnTable(db).get(tenantId, tableId)) throw new RestaurantInputError('The table already has an open order');
      }
      const businessDate = localDate(new Date(), tenantId);
      sql.insertOrder(db).run({
        order_id: orderId, tenant_id: tenantId, order_no: nextNumber(db, tenantId, businessDate, 'ORDER'),
        order_type: orderType, table_id: tableId, ...fields, parent_order_id: null,
        opened_by: text(input, 'user_id'), business_date: businessDate,
      });
    })();
    triggerSync();
    return { success: true, order: sql.findOrder(db).get(orderId) as RestaurantOrderRow };
  } catch (error) {
    return failure('openOrder', error);
  }
}

/** IPC `restaurant:updateOrder` — covers, waiter, customer, channel, delivery fee and note. */
export function updateOrder(payload: unknown): Result {
  try {
    const input = asInput(payload);
    const db = getDb();
    const order = requireOrder(db, requiredText(input, 'order_id'), ['OPEN', 'BILLING']);
    sql.updateOrderDetails(db).run({ order_id: order.order_id, ...orderFields(input) });
    triggerSync();
    return { success: true };
  } catch (error) {
    return failure('updateOrder', error);
  }
}

/** IPC `restaurant:sendItems` — stores the new lines and one KOT per station. The caller prints the returned tickets. */
export function sendItems(payload: unknown): Result<{ kot_ids: string[] }> {
  try {
    const input = asInput(payload);
    const userId = text(input, 'user_id');
    const lines = list(input, 'lines').map(parseLine);
    if (lines.length === 0) throw new RestaurantInputError('Nothing to send');
    const db = getDb();
    const kotIds: string[] = [];
    db.transaction(() => {
      const order = requireOrder(db, requiredText(input, 'order_id'));
      const businessDate = localDate(new Date(), order.tenant_id);
      for (const group of routeToStations(lines, stationsOf(db, order.tenant_id))) {
        const kotId = insertKot(db, order, 'NEW', group.station, userId, businessDate);
        kotIds.push(kotId);
        for (const line of group.items) {
          sql.insertLine(db).run({
            line_id: randomUUID(), tenant_id: order.tenant_id, order_id: order.order_id, ...line,
            station_id: group.station?.station_id ?? null, kot_id: kotId, moved_from_line_id: null,
            created_by: userId, created_at: null,
          });
        }
      }
    })();
    triggerSync();
    return { success: true, kot_ids: kotIds };
  } catch (error) {
    return failure('sendItems', error);
  }
}

/** IPC `restaurant:voidLines` — `{ order_id, reason, user_id, lines: [{ line_id, quantity? }] }`. */
export function voidLines(payload: unknown): Result<{ kot_ids: string[] }> {
  try {
    const input = asInput(payload);
    const reason = requiredText(input, 'reason');
    if (reason.toUpperCase() === MOVED) throw new RestaurantInputError('Choose another reason');
    const userId = text(input, 'user_id');
    const db = getDb();
    let kotIds: string[] = [];
    db.transaction(() => {
      const order = requireOrder(db, requiredText(input, 'order_id'));
      const parts = list(input, 'lines').map(p => {
        const line = sql.findLine(db).get(requiredText(p, 'line_id')) as OrderLineRow | undefined;
        if (!line || line.order_id !== order.order_id || line.status !== 'ACTIVE') throw new RestaurantInputError('Item is no longer on the order');
        const quantity = number(p, 'quantity', line.quantity, 0);
        if (quantity <= 0 || quantity > line.quantity) throw new RestaurantInputError(`Void quantity for ${line.name} must be 1 to ${line.quantity}`);
        return { line, quantity };
      });
      if (parts.length === 0) throw new RestaurantInputError('Select items to void');
      kotIds = voidInTransaction(db, order, parts, reason, userId);
    })();
    triggerSync();
    return { success: true, kot_ids: kotIds };
  } catch (error) {
    return failure('voidLines', error);
  }
}

/** IPC `restaurant:moveTable` — the target table must be free (otherwise merge the two orders). */
export function moveTable(payload: unknown): Result {
  try {
    const input = asInput(payload);
    const tableId = requiredText(input, 'table_id');
    const db = getDb();
    db.transaction(() => {
      const order = requireOrder(db, requiredText(input, 'order_id'));
      if (order.order_type !== 'DINE_IN') throw new RestaurantInputError('Only dine-in orders have a table');
      if (!sql.findDiningTable(db).get(tableId)) throw new RestaurantInputError('Table not found');
      const occupant = sql.findActiveOrderOnTable(db).get(order.tenant_id, tableId) as RestaurantOrderRow | undefined;
      if (occupant && occupant.order_id !== order.order_id) throw new RestaurantInputError('The table is occupied: merge the orders instead');
      sql.updateOrderTable(db).run(tableId, order.order_id);
    })();
    triggerSync();
    return { success: true };
  } catch (error) {
    return failure('moveTable', error);
  }
}

/** IPC `restaurant:mergeOrders` — moves every item and kitchen ticket of the source into the target, cancels the source. */
export function mergeOrders(payload: unknown): Result {
  try {
    const input = asInput(payload);
    const userId = text(input, 'user_id');
    const db = getDb();
    db.transaction(() => {
      const target = requireOrder(db, requiredText(input, 'target_order_id'));
      const source = requireOrder(db, requiredText(input, 'source_order_id'));
      if (target.order_id === source.order_id) throw new RestaurantInputError('Choose two different orders');
      for (const line of sql.listLinesOfOrder(db).all(source.order_id) as OrderLineRow[]) {
        if (line.status !== 'ACTIVE') continue;
        copyLine(db, line, target.order_id, line.quantity, userId);
        sql.voidLine(db).run(MOVED, userId, null, line.line_id);
      }
      sql.moveKotsToOrder(db).run(target.order_id, source.order_id);
      sql.addOrderCovers(db).run(source.covers, target.order_id);
      sql.cancelOrder(db).run('MERGED', target.order_id, source.order_id);
    })();
    triggerSync();
    return { success: true };
  } catch (error) {
    return failure('mergeOrders', error);
  }
}

/** IPC `restaurant:splitOrder` — moves the chosen quantities into a new order (separate bill) on the same table. */
export function splitOrder(payload: unknown): Result<{ order_id: string }> {
  try {
    const input = asInput(payload);
    const userId = text(input, 'user_id');
    const db = getDb();
    const childId = randomUUID();
    db.transaction(() => {
      const order = requireOrder(db, requiredText(input, 'order_id'));
      const parts = list(input, 'lines').map(p => {
        const line = sql.findLine(db).get(requiredText(p, 'line_id')) as OrderLineRow | undefined;
        if (!line || line.order_id !== order.order_id || line.status !== 'ACTIVE') throw new RestaurantInputError('Item is no longer on the order');
        const quantity = number(p, 'quantity', line.quantity, 0);
        if (quantity <= 0 || quantity > line.quantity) throw new RestaurantInputError(`Split quantity for ${line.name} must be 1 to ${line.quantity}`);
        return { line, quantity };
      });
      if (parts.length === 0) throw new RestaurantInputError('Select items for the new bill');
      const remaining = (sql.listLinesOfOrder(db).all(order.order_id) as OrderLineRow[])
        .filter(l => l.status === 'ACTIVE')
        .reduce((sum, l) => sum + l.quantity, 0) - parts.reduce((sum, p) => sum + p.quantity, 0);
      if (remaining <= 0) throw new RestaurantInputError('Leave at least one item on the original bill');
      const businessDate = localDate(new Date(), order.tenant_id);
      sql.insertOrder(db).run({
        order_id: childId, tenant_id: order.tenant_id, order_no: nextNumber(db, order.tenant_id, businessDate, 'ORDER'),
        order_type: order.order_type, table_id: order.table_id, covers: 0, waiter_user_id: order.waiter_user_id,
        waiter_name: order.waiter_name, customer_name: null, customer_phone: null, delivery_address: order.delivery_address,
        channel: order.channel, channel_ref: order.channel_ref, delivery_fee: 0, parent_order_id: order.order_id,
        note: null, opened_by: userId, business_date: businessDate,
      });
      for (const { line, quantity } of parts) {
        sql.voidLine(db).run(MOVED, userId, null, line.line_id);
        copyLine(db, line, childId, quantity, userId);
        if (quantity < line.quantity) copyLine(db, line, order.order_id, line.quantity - quantity, userId);
      }
    })();
    triggerSync();
    return { success: true, order_id: childId };
  } catch (error) {
    return failure('splitOrder', error);
  }
}

/** IPC `restaurant:cancelOrder` — voids what the kitchen already has (VOID tickets) and closes the order. */
export function cancelOrder(payload: unknown): Result<{ kot_ids: string[] }> {
  try {
    const input = asInput(payload);
    const reason = requiredText(input, 'reason');
    const userId = text(input, 'user_id');
    const db = getDb();
    let kotIds: string[] = [];
    db.transaction(() => {
      const order = requireOrder(db, requiredText(input, 'order_id'));
      const active = (sql.listLinesOfOrder(db).all(order.order_id) as OrderLineRow[]).filter(l => l.status === 'ACTIVE');
      if (active.length > 0) kotIds = voidInTransaction(db, order, active.map(line => ({ line, quantity: line.quantity })), reason, userId);
      sql.cancelOrder(db).run(reason, null, order.order_id);
    })();
    triggerSync();
    return { success: true, kot_ids: kotIds };
  } catch (error) {
    return failure('cancelOrder', error);
  }
}

export type ClaimResult = { success: true; offline?: boolean } | { success: false; error: string; holder?: string | null };

/** Applies a billing claim in this terminal's database (the LAN primary runs this for every terminal). */
export function claimLocal(payload: unknown): ClaimResult {
  try {
    const input = asInput(payload);
    const orderId = requiredText(input, 'order_id');
    const terminal = requiredText(input, 'terminal');
    const db = getDb();
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
    const changes = sql.claimOrderForBilling(db).run({ order_id: orderId, terminal, stale_before: staleBefore }).changes;
    if (changes === 1) return { success: true };
    const order = sql.findOrder(db).get(orderId) as RestaurantOrderRow | undefined;
    if (!order) return { success: false, error: 'Order not found' };
    if (order.status === 'BILLING') return { success: false, error: 'The order is being billed on another terminal', holder: order.billing_terminal };
    return { success: false, error: `The order is ${order.status.toLowerCase()}` };
  } catch (error) {
    return failure('claimLocal', error);
  }
}

/** IPC `restaurant:releaseClaim` — back to OPEN when billing was abandoned. */
export function releaseClaim(payload: unknown): Result {
  try {
    sql.releaseBillingClaim(getDb()).run(requiredText(asInput(payload), 'order_id'));
    return { success: true };
  } catch (error) {
    return failure('releaseClaim', error);
  }
}

/**
 * Marks the order paid by `invoiceId`. Called by checkout inside its transaction: when the order was already settled
 * or cancelled (for example by another terminal), the whole checkout rolls back with this message.
 */
export function settleInTransaction(db: Db, orderId: string, invoiceId: string, invoiceNumber: string): void {
  if (sql.settleOrder(db).run(invoiceId, invoiceNumber, orderId).changes !== 1) {
    const order = sql.findOrder(db).get(orderId) as RestaurantOrderRow | undefined;
    throw new RestaurantSettleError(order
      ? `Order ${order.order_no} is already ${order.status === 'SETTLED' ? `billed (${order.invoice_number ?? 'another bill'})` : order.status.toLowerCase()}`
      : 'The restaurant order no longer exists');
  }
}

