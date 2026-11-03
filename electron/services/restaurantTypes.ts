/** Row and payload shapes of restaurant mode (main process). Renderer shapes live in src/data/restaurant.ts. */

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type OrderStatus = 'OPEN' | 'BILLING' | 'SETTLED' | 'CANCELLED';
export type KdsStatus = 'NEW' | 'PREPARING' | 'READY' | 'SERVED';
export const ORDER_TYPES: readonly OrderType[] = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'];
/** Accepted channels (UAE and India apps); the order screen offers the ones of the shop's country. */
export const DELIVERY_CHANNELS = ['OWN', 'TALABAT', 'DELIVEROO', 'NOON', 'CAREEM', 'SWIGGY', 'ZOMATO', 'OTHER'] as const;
export const KDS_STATUSES: readonly KdsStatus[] = ['NEW', 'PREPARING', 'READY', 'SERVED'];

export interface DiningTableRow {
  table_id: string; tenant_id: string; label: string; area: string | null; seats: number; sort_order: number;
  is_active: number;
}
export interface KitchenStationRow {
  station_id: string; tenant_id: string; name: string; categories: string; print_copies: number; is_default: number;
  sort_order: number;
}
export interface ModifierGroupRow {
  group_id: string; tenant_id: string; name: string; min_select: number; max_select: number; categories: string;
  product_ids: string; sort_order: number;
}
export interface ModifierRow {
  modifier_id: string; tenant_id: string; group_id: string; name: string; price: number; tax_rate: number;
  sort_order: number; is_active: number;
}
export interface RestaurantOrderRow {
  order_id: string; tenant_id: string; order_no: string; order_type: OrderType; table_id: string | null; covers: number;
  waiter_user_id: string | null; waiter_name: string | null; customer_name: string | null; customer_phone: string | null;
  delivery_address: string | null; channel: string; channel_ref: string | null; delivery_fee: number;
  status: OrderStatus; billing_terminal: string | null; billing_since: string | null; invoice_id: string | null;
  invoice_number: string | null; parent_order_id: string | null; merged_into_order_id: string | null; note: string | null;
  cancel_reason: string | null; opened_by: string | null; opened_at: string; closed_at: string | null; business_date: string;
}
export interface OrderModifier { modifier_id: string; name: string; price: number; tax_rate: number }
export interface OrderLineRow {
  line_id: string; tenant_id: string; order_id: string; product_id: string; name: string; category: string | null;
  quantity: number; unit_price: number; tax_rate: number; modifiers: string; note: string | null; seat: number | null;
  station_id: string | null; kot_id: string | null; status: 'ACTIVE' | 'VOIDED'; void_reason: string | null;
  voided_by: string | null; voided_at: string | null; void_kot_id: string | null; moved_from_line_id: string | null;
  created_by: string | null; created_at: string;
}
export interface KotTicketRow {
  kot_id: string; tenant_id: string; order_id: string; kot_no: string; kind: 'NEW' | 'VOID'; station_id: string | null;
  station_name: string | null; printed_at: string | null; print_error: string | null; kds_status: KdsStatus;
  kds_updated_at: string | null; created_by: string | null; business_date: string; created_at: string;
}

/** Result of every write: `{ success, error? }` like other services. */
export type Result<T = object> = ({ success: true } & T) | { success: false; error: string };
