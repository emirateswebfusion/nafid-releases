import { getDb } from '../db/localDb.js';
import * as sql from '../db/statements/restaurant.js';
import { getStoreTimezoneSetting, localDate } from './storeTime.js';
import { buildKotText, type KotTicketLine } from './restaurantKot.js';
import { normalizeTarget, readKitchenPrinterConfig, writeKitchenPrinterConfig, type KitchenPrinterConfig } from './kitchenPrinterConfig.js';
import { printKitchenTicket } from '../hardware/kotPrinter.js';
import { KDS_STATUSES, type DiningTableRow, type KdsStatus, type KitchenStationRow, type KotTicketRow, type OrderLineRow,
  type OrderModifier, type RestaurantOrderRow, type Result } from './restaurantTypes.js';
import { asInput, failure, parseJsonList, requiredText, text, textList, RestaurantInputError } from './restaurantInput.js';

/** Kitchen side of restaurant mode: printing KOTs, the kitchen display (KDS) and restaurant reports. */

export interface KotPrintResult { kot_id: string; ok: boolean; error?: string }

function modifiersOf(line: OrderLineRow): OrderModifier[] {
  return parseJsonList(line.modifiers).filter((m): m is OrderModifier => !!m && typeof m === 'object' && typeof (m as OrderModifier).name === 'string');
}

function ticketLines(lines: OrderLineRow[]): KotTicketLine[] {
  return lines.map(l => ({ name: l.name, quantity: l.quantity, modifiers: modifiersOf(l), note: l.note, seat: l.seat }));
}

/** Ticket text of a stored KOT (VOID tickets list the voided quantities). */
export function kotText(kotId: string, reprint: boolean, width: number): { text: string; kot: KotTicketRow } {
  const db = getDb();
  const kot = sql.findKot(db).get(kotId) as KotTicketRow | undefined;
  if (!kot) throw new RestaurantInputError('Ticket not found');
  const order = sql.findOrder(db).get(kot.order_id) as RestaurantOrderRow | undefined;
  if (!order) throw new RestaurantInputError('Order not found');
  const lines = kot.kind === 'VOID'
    ? sql.listVoidedLinesOfKot(db).all(kot.kot_id) as OrderLineRow[]
    : sql.listActiveLinesOfKot(db).all(kot.kot_id) as OrderLineRow[];
  const table = order.table_id ? sql.findDiningTable(db).get(order.table_id) as DiningTableRow | undefined : undefined;
  const tz = getStoreTimezoneSetting(db, order.tenant_id);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const text = buildKotText({
    kotNo: kot.kot_no, kind: reprint && kot.kind === 'NEW' ? 'REPRINT' : kot.kind, stationName: kot.station_name ?? 'Kitchen',
    orderNo: order.order_no, orderType: order.order_type, tableLabel: table?.label ?? null, covers: order.covers,
    waiterName: order.waiter_name, customerName: order.customer_name, channel: order.channel, channelRef: order.channel_ref,
    orderNote: order.note, time,
  }, ticketLines(lines), width === 58 ? 32 : 42);
  return { text, kot };
}

async function printOne(kotId: string, reprint: boolean, config: KitchenPrinterConfig): Promise<KotPrintResult> {
  const db = getDb();
  try {
    const { text, kot } = kotText(kotId, reprint, config.widthMm);
    const stationRow = kot.station_id ? (sql.listKitchenStations(db).all(kot.tenant_id) as KitchenStationRow[]).find(s => s.station_id === kot.station_id) : undefined;
    const target = (kot.station_id && config.stations[kot.station_id]) || { type: 'none' as const };
    for (let copy = 0; copy < Math.max(1, stationRow?.print_copies ?? 1); copy++) {
      await printKitchenTicket(target, text, config.widthMm, kot.tenant_id);
    }
    sql.markKotPrinted(db).run(null, null, kotId);
    return { kot_id: kotId, ok: true };
  } catch (error) {
    const message = (error as Error)?.message || 'Print failed';
    try { sql.markKotPrinted(db).run(message, message, kotId); } catch { /* the ticket may not exist */ }
    return { kot_id: kotId, ok: false, error: message };
  }
}

/** IPC `restaurant:printKots` — `{ kot_ids, reprint? }`. Prints in order; a failed ticket keeps `print_error`. */
export async function printKots(payload: unknown): Promise<{ success: boolean; results: KotPrintResult[] }> {
  const input = asInput(payload);
  const ids = textList(input, 'kot_ids');
  const reprint = input.reprint === true;
  const config = await readKitchenPrinterConfig();
  const results: KotPrintResult[] = [];
  for (const id of ids) results.push(await printOne(id, reprint, config));
  return { success: results.every(r => r.ok), results };
}

/** IPC `restaurant:previewKot` — ticket text, for the screen when no printer is set. */
export async function previewKot(payload: unknown): Promise<Result<{ text: string }>> {
  try {
    const config = await readKitchenPrinterConfig();
    return { success: true, text: kotText(requiredText(asInput(payload), 'kot_id'), false, config.widthMm).text };
  } catch (error) {
    return failure('previewKot', error);
  }
}

/** IPC `restaurant:getPrinterConfig` */
export function getPrinterConfig(): Promise<KitchenPrinterConfig> {
  return readKitchenPrinterConfig();
}

/** IPC `restaurant:savePrinterConfig` */
export async function savePrinterConfig(payload: unknown): Promise<Result<{ config: KitchenPrinterConfig }>> {
  try {
    return await writeKitchenPrinterConfig(payload);
  } catch (error) {
    return failure('savePrinterConfig', error);
  }
}

/** IPC `restaurant:testPrinter` — `{ tenant_id, station_name, target }` prints a short test ticket. */
export async function testPrinter(payload: unknown): Promise<Result> {
  try {
    const input = asInput(payload);
    const config = await readKitchenPrinterConfig();
    const name = text(input, 'station_name') ?? 'Kitchen';
    await printKitchenTicket(normalizeTarget(input.target), `*** TEST ***\n${name}\nNafid kitchen printer OK`, config.widthMm, requiredText(input, 'tenant_id'));
    return { success: true };
  } catch (error) {
    if (error instanceof Error && !(error instanceof RestaurantInputError)) return { success: false, error: error.message };
    return failure('testPrinter', error);
  }
}

export interface KdsData {
  tickets: (KotTicketRow & { order_no: string; order_type: string; table_id: string | null; waiter_name: string | null; customer_name: string | null; order_note: string | null })[];
  lines: OrderLineRow[];
  tables: DiningTableRow[];
}

/** IPC `restaurant:listKds` — unfinished tickets of today and yesterday (a service may run past midnight). */
export function listKds(payload: unknown): KdsData {
  const tenantId = requiredText(asInput(payload), 'tenant_id');
  const db = getDb();
  const since = localDate(new Date(Date.now() - 24 * 60 * 60 * 1000), tenantId);
  return {
    tickets: sql.listKdsTickets(db).all(tenantId, since) as KdsData['tickets'],
    lines: sql.listKdsLines(db).all(tenantId, since) as OrderLineRow[],
    tables: sql.listDiningTables(db).all(tenantId) as DiningTableRow[],
  };
}

/** IPC `restaurant:setKdsStatus` — forward only (NEW → PREPARING → READY → SERVED); the database ignores going back. */
export function setKdsStatus(payload: unknown): Result {
  try {
    const input = asInput(payload);
    const status = requiredText(input, 'status').toUpperCase() as KdsStatus;
    if (!KDS_STATUSES.includes(status)) throw new RestaurantInputError('Unknown kitchen status');
    sql.updateKdsStatus(getDb()).run(status, requiredText(input, 'kot_id'));
    return { success: true };
  } catch (error) {
    return failure('setKdsStatus', error);
  }
}

export interface RestaurantReport {
  byType: { order_type: string; channel: string; orders: number; total: number; covers: number }[];
  byWaiter: { waiter_name: string; orders: number; total: number; covers: number }[];
  voids: { reason: string; lines: number; value: number }[];
}

/** IPC `restaurant:report` — settled sales by order type / channel and waiter, voids by reason (business dates). */
export function report(payload: unknown): RestaurantReport {
  const input = asInput(payload);
  const tenantId = requiredText(input, 'tenant_id');
  const today = localDate(new Date(), tenantId);
  const from = text(input, 'from') ?? today;
  const to = text(input, 'to') ?? today;
  const db = getDb();
  return {
    byType: sql.salesByOrderType(db).all(tenantId, from, to) as RestaurantReport['byType'],
    byWaiter: sql.salesByWaiter(db).all(tenantId, from, to) as RestaurantReport['byWaiter'],
    voids: sql.voidsByReason(db).all(tenantId, from, to) as RestaurantReport['voids'],
  };
}
