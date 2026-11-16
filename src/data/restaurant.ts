import { bindBridge } from './client';

/** Restaurant mode: tables, kitchen stations, modifiers, orders, KOT, kitchen display (electron/services/restaurant*). */

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type OrderStatus = 'OPEN' | 'BILLING' | 'SETTLED' | 'CANCELLED' | 'PENDING_APPROVAL' | 'ACCEPTED';
export type KdsStatus = 'NEW' | 'PREPARING' | 'READY' | 'SERVED';

export interface DiningTable {
  table_id: string; tenant_id: string; label: string; area: string | null; seats: number; sort_order: number;
  is_active: number;
}
export interface KitchenStation {
  station_id: string; tenant_id: string; name: string; categories: string; print_copies: number; is_default: number;
  sort_order: number;
}
export interface ModifierGroup {
  group_id: string; tenant_id: string; name: string; min_select: number; max_select: number; categories: string;
  product_ids: string; sort_order: number;
}
export interface Modifier {
  modifier_id: string; tenant_id: string; group_id: string; name: string; price: number; tax_rate: number;
  sort_order: number; is_active: number;
}
export interface RestaurantSetup {
  tables: DiningTable[]; stations: KitchenStation[]; modifierGroups: ModifierGroup[]; modifiers: Modifier[];
}
export interface RestaurantOrder {
  order_id: string; tenant_id: string; order_no: string; order_type: OrderType; table_id: string | null; covers: number;
  waiter_user_id: string | null; waiter_name: string | null; customer_name: string | null; customer_phone: string | null;
  delivery_address: string | null; channel: string; channel_ref: string | null; delivery_fee: number;
  status: OrderStatus; billing_terminal: string | null; billing_since: string | null; invoice_id: string | null;
  invoice_number: string | null; parent_order_id: string | null; merged_into_order_id: string | null; note: string | null;
  cancel_reason: string | null; opened_by: string | null; opened_at: string; closed_at: string | null; business_date: string;
}
export interface OrderModifier { modifier_id: string; name: string; price: number; tax_rate: number }
export interface OrderLine {
  line_id: string; tenant_id: string; order_id: string; product_id: string; name: string; category: string | null;
  quantity: number; unit_price: number; tax_rate: number; modifiers: string; note: string | null; seat: number | null;
  station_id: string | null; kot_id: string | null; status: 'ACTIVE' | 'VOIDED'; void_reason: string | null;
  voided_by: string | null; voided_at: string | null; void_kot_id: string | null; moved_from_line_id: string | null;
  created_by: string | null; created_at: string;
}
export interface KotTicket {
  kot_id: string; tenant_id: string; order_id: string; kot_no: string; kind: 'NEW' | 'VOID'; station_id: string | null;
  station_name: string | null; printed_at: string | null; print_error: string | null; kds_status: KdsStatus;
  kds_updated_at: string | null; created_by: string | null; business_date: string; created_at: string;
}
export interface ActiveOrders {
  orders: RestaurantOrder[]; lines: OrderLine[]; kots: KotTicket[]; closedToday: RestaurantOrder[]; terminal: string;
}
export interface KdsTicket extends KotTicket {
  order_no: string; order_type: OrderType; table_id: string | null; waiter_name: string | null;
  customer_name: string | null; order_note: string | null;
}
export interface KdsData { tickets: KdsTicket[]; lines: OrderLine[]; tables: DiningTable[] }
export type KitchenPrinterTarget = { type: 'none' } | { type: 'network'; ip: string; port: number } | { type: 'usb'; deviceName: string };
export interface KitchenPrinterConfig { widthMm: 58 | 80; stations: Record<string, KitchenPrinterTarget> }
export interface KotPrintResult { kot_id: string; ok: boolean; error?: string }
export interface RestaurantReport {
  byType: { order_type: string; channel: string; orders: number; total: number; covers: number }[];
  byWaiter: { waiter_name: string; orders: number; total: number; covers: number }[];
  voids: { reason: string; lines: number; value: number }[];
}

export type WriteResult<T = object> = ({ success: true } & T) | { success: false; error: string };
export type ClaimResult = { success: true; offline?: boolean } | { success: false; error: string; holder?: string | null };

/** Item sent to the kitchen (`unit_price` is the order-time price on the shop's price basis). */
export interface NewOrderLine {
  product_id: string; name: string; category: string | null; quantity: number; unit_price: number; tax_rate: number;
  modifiers: OrderModifier[]; note: string | null; seat: number | null;
}

/** An item on the order screen that is not sent to the kitchen yet (`key` identifies it on screen). */
export interface DraftLine extends NewOrderLine { key: string }

export interface QrResult {
  token: string;
  url: string;
  qr_code: string;
  table_id?: string | null;
  table_label?: string | null;
}
export interface SendWhatsAppQrResult {
  success: boolean;
  formattedPhone?: string;
  wa_url?: string;
  error?: string;
}
export interface PendingOnlineOrder extends RestaurantOrder {
  lines: OrderLine[];
}

export const restaurantApi = bindBridge({
  getSetup: 'restaurantGetSetup',
  saveTable: 'restaurantSaveTable',
  deleteTable: 'restaurantDeleteTable',
  saveStation: 'restaurantSaveStation',
  deleteStation: 'restaurantDeleteStation',
  saveModifierGroup: 'restaurantSaveModifierGroup',
  deleteModifierGroup: 'restaurantDeleteModifierGroup',
  listActive: 'restaurantListActive',
  getOrder: 'restaurantGetOrder',
  openOrder: 'restaurantOpenOrder',
  updateOrder: 'restaurantUpdateOrder',
  sendItems: 'restaurantSendItems',
  voidLines: 'restaurantVoidLines',
  moveTable: 'restaurantMoveTable',
  mergeOrders: 'restaurantMergeOrders',
  splitOrder: 'restaurantSplitOrder',
  cancelOrder: 'restaurantCancelOrder',
  claimForBilling: 'restaurantClaimForBilling',
  releaseClaim: 'restaurantReleaseClaim',
  printKots: 'restaurantPrintKots',
  previewKot: 'restaurantPreviewKot',
  getPrinterConfig: 'restaurantGetPrinterConfig',
  savePrinterConfig: 'restaurantSavePrinterConfig',
  testPrinter: 'restaurantTestPrinter',
  listKds: 'restaurantListKds',
  setKdsStatus: 'restaurantSetKdsStatus',
  report: 'restaurantReport',
  listPendingOnlineOrders: 'restaurantListPendingOnlineOrders',
  acceptOnlineOrder: 'restaurantAcceptOnlineOrder',
  rejectOnlineOrder: 'restaurantRejectOnlineOrder',
  generateTableQr: 'restaurantGenerateTableQr',
  sendTableWhatsApp: 'restaurantSendTableWhatsApp',
});

/** Parses a JSON text list column (`categories`, `product_ids`); bad values read as empty. */
export function parseTextList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Modifiers stored on an order line. */
export function lineModifiers(line: Pick<OrderLine, 'modifiers'>): OrderModifier[] {
  try {
    const parsed: unknown = JSON.parse(line.modifiers || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((m): m is OrderModifier => !!m && typeof m === 'object' && typeof (m as OrderModifier).name === 'string')
      : [];
  } catch {
    return [];
  }
}
