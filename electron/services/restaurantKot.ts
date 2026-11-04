/** Kitchen order tickets: routing order lines to kitchen stations and the ticket text. Pure functions, no I/O. */

export interface KotStation {
  station_id: string;
  name: string;
  categories: string[];
  is_default: boolean;
}

export interface KotTicketLine {
  name: string;
  quantity: number;
  modifiers: { name: string }[];
  note?: string | null;
  seat?: number | null;
}

export interface KotTicketHeader {
  kotNo: string;
  kind: 'NEW' | 'VOID' | 'REPRINT';
  stationName: string;
  orderNo: string;
  orderType: string;
  tableLabel?: string | null;
  covers?: number | null;
  waiterName?: string | null;
  customerName?: string | null;
  channel?: string | null;
  channelRef?: string | null;
  orderNote?: string | null;
  /** Wall-clock time in the store timezone, already formatted ("14:05"). */
  time: string;
}

const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/**
 * Station of a product category: the station listing the category (first by order), else the default station, else
 * the first station. `null` when the shop has no stations (tickets are then not printed, the order is still saved).
 */
export function stationForCategory(category: string | null | undefined, stations: readonly KotStation[]): KotStation | null {
  if (stations.length === 0) return null;
  const key = norm(category);
  if (key) {
    const match = stations.find(s => s.categories.some(c => norm(c) === key));
    if (match) return match;
  }
  return stations.find(s => s.is_default) ?? stations[0];
}

/** Groups items by the station their category routes to, keeping the original order within each station. */
export function routeToStations<T extends { category?: string | null }>(items: readonly T[], stations: readonly KotStation[]) {
  const groups = new Map<string | null, { station: KotStation | null; items: T[] }>();
  for (const item of items) {
    const station = stationForCategory(item.category, stations);
    const key = station?.station_id ?? null;
    const group = groups.get(key) ?? { station, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

const ORDER_TYPE_LABEL: Record<string, string> = { DINE_IN: 'DINE-IN', TAKEAWAY: 'TAKEAWAY', DELIVERY: 'DELIVERY' };

function formatQty(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Wraps text to `width` columns, continuing lines with `indent` spaces. */
function wrap(text: string, width: number, indent: number): string[] {
  const pad = ' '.repeat(Math.min(indent, Math.floor(width / 2)));
  const lines: string[] = [];
  let rest = text;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width);
    if (cut <= pad.length) cut = width;
    lines.push(rest.slice(0, cut).trimEnd());
    rest = pad + rest.slice(cut).trimStart();
  }
  lines.push(rest);
  return lines;
}

/** Plain-text ticket for a thermal printer (no prices). `width` is the character count of the roll (32 or 42/48). */
export function buildKotText(header: KotTicketHeader, lines: readonly KotTicketLine[], width = 42): string {
  const rule = '-'.repeat(width);
  const center = (text: string) => {
    const t = text.slice(0, width);
    return ' '.repeat(Math.max(0, Math.floor((width - t.length) / 2))) + t;
  };
  const out: string[] = [];
  if (header.kind === 'VOID') out.push(center('*** VOID ***'));
  if (header.kind === 'REPRINT') out.push(center('*** REPRINT ***'));
  out.push(center(`KOT ${header.kotNo}  ${header.stationName.toUpperCase()}`));
  out.push(rule);
  const where = header.orderType === 'DINE_IN'
    ? `TABLE ${header.tableLabel ?? '-'}${header.covers ? `  (${header.covers} pax)` : ''}`
    : `${ORDER_TYPE_LABEL[header.orderType] ?? header.orderType} #${header.orderNo}`;
  out.push(where);
  if (header.orderType === 'DINE_IN') out.push(`Order ${header.orderNo}`);
  if (header.channel && header.channel !== 'OWN') out.push(`${header.channel}${header.channelRef ? ` ${header.channelRef}` : ''}`);
  if (header.customerName) out.push(...wrap(`Customer: ${header.customerName}`, width, 2));
  if (header.waiterName) out.push(`Waiter: ${header.waiterName}`);
  out.push(`Time: ${header.time}`);
  out.push(rule);
  for (const line of lines) {
    const qty = `${header.kind === 'VOID' ? '-' : ''}${formatQty(line.quantity)} x `;
    out.push(...wrap(`${qty}${line.name}${line.seat ? ` [S${line.seat}]` : ''}`, width, qty.length));
    for (const modifier of line.modifiers) out.push(...wrap(`   + ${modifier.name}`, width, 5));
    if (line.note && line.note.trim()) out.push(...wrap(`   * ${line.note.trim()}`, width, 5));
  }
  out.push(rule);
  const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);
  out.push(`Items: ${lines.length}   Qty: ${formatQty(totalQty)}`);
  if (header.orderNote && header.orderNote.trim()) out.push(...wrap(`NOTE: ${header.orderNote.trim()}`, width, 6));
  return out.join('\n');
}
