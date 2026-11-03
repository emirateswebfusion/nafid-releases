import { useCallback, useState } from 'react';
import { restaurantApi, type NewOrderLine, type OrderLine, type RestaurantOrder } from '../../../data/restaurant';
import { printingApi } from '../../../data/printing';
import { getProductsByIds } from '../../../data/products';
import { isUaeStore } from '../../../utils/localization/storeProfile';
import { orderToCartItems } from '../restaurantRules';
import { guestCheckText } from '../guestCheck';
import { sendOrderToBilling } from '../restaurantBillHandover';
import type { RestaurantData } from './useRestaurantData';

export interface ActionContext {
  tenantId: string;
  userId: string | null;
  shopName: string;
  data: RestaurantData;
  /** Leaves the restaurant screen (Billing shows the handed-over order). */
  onClose: () => void;
}

/** Order operations of the restaurant screen, with one status message for the toolbar. */
export function useOrderActions(ctx: ActionContext) {
  const { tenantId, userId, data } = ctx;
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [working, setWorking] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setWorking(true);
    try {
      return await fn();
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message || 'Operation failed' });
      return null;
    } finally {
      setWorking(false);
      void data.refreshOrders();
    }
  }, [data]);

  const report = useCallback((result: { success: boolean; error?: string } | null, okText?: string) => {
    if (!result) return false;
    if (!result.success) { setMessage({ tone: 'error', text: result.error || 'Operation failed' }); return false; }
    if (okText) setMessage({ tone: 'ok', text: okText });
    return true;
  }, []);

  const printTickets = useCallback(async (kotIds: string[], reprint = false) => {
    if (kotIds.length === 0) return;
    const result = await restaurantApi.printKots({ kot_ids: kotIds, reprint });
    const failed = result.results.filter(r => !r.ok);
    if (failed.length > 0) setMessage({ tone: 'warn', text: `Saved, but ${failed.length} kitchen ticket(s) did not print: ${failed[0].error}` });
  }, []);

  const openOrder = useCallback((fields: Record<string, unknown>) => run(async () => {
    const result = await restaurantApi.openOrder({ tenant_id: tenantId, user_id: userId, ...fields });
    return report(result) && result.success ? result.order : null;
  }), [run, report, tenantId, userId]);

  const updateOrder = useCallback((order: RestaurantOrder, fields: Record<string, unknown>) => run(async () =>
    report(await restaurantApi.updateOrder({ ...order, ...fields, order_id: order.order_id }), 'Order updated')), [run, report]);

  const sendItems = useCallback((order: RestaurantOrder, lines: NewOrderLine[]) => run(async () => {
    const result = await restaurantApi.sendItems({ tenant_id: tenantId, order_id: order.order_id, user_id: userId, lines });
    if (!report(result, 'Sent to kitchen') || !result.success) return false;
    await printTickets(result.kot_ids);
    return true;
  }), [run, report, printTickets, tenantId, userId]);

  const voidLines = useCallback((order: RestaurantOrder, lines: { line_id: string; quantity?: number }[], reason: string) => run(async () => {
    const result = await restaurantApi.voidLines({ order_id: order.order_id, reason, user_id: userId, lines });
    if (!report(result, 'Items voided') || !result.success) return false;
    await printTickets(result.kot_ids);
    return true;
  }), [run, report, printTickets, userId]);

  const moveTable = useCallback((order: RestaurantOrder, tableId: string) => run(async () =>
    report(await restaurantApi.moveTable({ order_id: order.order_id, table_id: tableId }), 'Table changed')), [run, report]);

  const mergeOrders = useCallback((target: RestaurantOrder, source: RestaurantOrder) => run(async () =>
    report(await restaurantApi.mergeOrders({ target_order_id: target.order_id, source_order_id: source.order_id, user_id: userId }), `Merged into ${target.order_no}`)), [run, report, userId]);

  const splitOrder = useCallback((order: RestaurantOrder, lines: { line_id: string; quantity: number }[]) => run(async () => {
    const result = await restaurantApi.splitOrder({ order_id: order.order_id, user_id: userId, lines });
    return report(result, 'New bill created') && result.success ? result.order_id : null;
  }), [run, report, userId]);

  const cancelOrder = useCallback((order: RestaurantOrder, reason: string) => run(async () => {
    const result = await restaurantApi.cancelOrder({ order_id: order.order_id, reason, user_id: userId });
    if (!report(result, `Order ${order.order_no} cancelled`) || !result.success) return false;
    await printTickets(result.kot_ids);
    return true;
  }), [run, report, printTickets, userId]);

  const reprint = useCallback((kotId: string) => run(async () => { await printTickets([kotId], true); return true; }), [run, printTickets]);

  const cartFor = useCallback(async (order: RestaurantOrder, lines: OrderLine[], applyServiceCharge: boolean) => {
    const ids = [...new Set(lines.map(l => l.product_id))];
    const products = ids.length ? await getProductsByIds({ tenant_id: tenantId, product_ids: ids }) : [];
    return orderToCartItems(order, lines, {
      products: Object.fromEntries(products.map(p => [p.product_id, p])),
      serviceCharge: data.serviceCharge,
      applyServiceCharge,
    });
  }, [tenantId, data.serviceCharge]);

  const titleOf = useCallback((order: RestaurantOrder) => {
    const table = order.table_id ? data.setup.tables.find(t => t.table_id === order.table_id) : undefined;
    return order.order_type === 'DINE_IN' ? `Table ${table?.label ?? '?'} · ${order.order_no}`
      : `${order.order_type === 'DELIVERY' ? 'Delivery' : 'Takeaway'} ${order.order_no}`;
  }, [data.setup.tables]);

  const printGuestCheck = useCallback((order: RestaurantOrder, lines: OrderLine[], applyServiceCharge = true) => run(async () => {
    const items = await cartFor(order, lines, applyServiceCharge);
    if (items.length === 0) { setMessage({ tone: 'warn', text: 'Nothing on the order yet' }); return false; }
    const text = guestCheckText({ shopName: ctx.shopName, title: titleOf(order), items, taxLabel: isUaeStore() ? 'VAT' : 'GST' });
    const printed = await printingApi.printReceipt(tenantId, text);
    return report(printed.success ? printed : { success: false, error: `Guest check not printed: ${printed.error || 'printer error'}` }, 'Guest check printed');
  }), [run, cartFor, titleOf, report, tenantId, ctx.shopName]);

  /** Claims the order (LAN primary when reachable) and opens it in Billing. */
  const billOrder = useCallback((order: RestaurantOrder, lines: OrderLine[], applyServiceCharge = true) => run(async () => {
    const items = await cartFor(order, lines, applyServiceCharge);
    if (items.length === 0) { setMessage({ tone: 'warn', text: 'Send items before billing' }); return false; }
    const claim = await restaurantApi.claimForBilling({ order_id: order.order_id });
    if (!claim.success) { setMessage({ tone: 'error', text: claim.error }); return false; }
    sendOrderToBilling({
      orderId: order.order_id, title: titleOf(order), items, customerName: order.customer_name,
      customerPhone: order.customer_phone, customerAddress: order.delivery_address,
      waiterUserId: order.waiter_user_id, waiterName: order.waiter_name,
    });
    ctx.onClose();
    return true;
  }), [run, cartFor, titleOf, ctx]);

  const releaseClaim = useCallback((order: RestaurantOrder) => run(async () =>
    report(await restaurantApi.releaseClaim({ order_id: order.order_id }), 'Order reopened')), [run, report]);

  return { message, setMessage, working, openOrder, updateOrder, sendItems, voidLines, moveTable, mergeOrders, splitOrder,
    cancelOrder, reprint, printGuestCheck, billOrder, releaseClaim, titleOf };
}

export type OrderActions = ReturnType<typeof useOrderActions>;
