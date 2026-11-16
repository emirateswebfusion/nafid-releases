import type { Db } from './types.js';

/** SQL statements used by services/restaurant*.ts (restaurant mode: tables, stations, modifiers, orders, KOT). */

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

// ── Setup ──────────────────────────────────────────────────────────────────────

export const listDiningTables = (db: Db) => db.prepare(`
  SELECT * FROM dining_tables WHERE tenant_id = ? AND is_deleted = 0 ORDER BY sort_order, label`);

export const upsertDiningTable = (db: Db) => db.prepare(`
  INSERT INTO dining_tables (table_id, tenant_id, label, area, seats, sort_order, is_active, sync_status)
  VALUES (@table_id, @tenant_id, @label, @area, @seats, @sort_order, @is_active, 'PENDING')
  ON CONFLICT(table_id) DO UPDATE SET label = excluded.label, area = excluded.area, seats = excluded.seats,
    sort_order = excluded.sort_order, is_active = excluded.is_active, is_deleted = 0,
    updated_at = ${NOW}, sync_status = 'PENDING'`);

export const softDeleteDiningTable = (db: Db) => db.prepare(`
  UPDATE dining_tables SET is_deleted = 1, updated_at = ${NOW}, sync_status = 'PENDING' WHERE table_id = ? AND tenant_id = ?`);

export const listKitchenStations = (db: Db) => db.prepare(`
  SELECT * FROM kitchen_stations WHERE tenant_id = ? AND is_deleted = 0 ORDER BY sort_order, name`);

export const upsertKitchenStation = (db: Db) => db.prepare(`
  INSERT INTO kitchen_stations (station_id, tenant_id, name, categories, print_copies, is_default, sort_order, sync_status)
  VALUES (@station_id, @tenant_id, @name, @categories, @print_copies, @is_default, @sort_order, 'PENDING')
  ON CONFLICT(station_id) DO UPDATE SET name = excluded.name, categories = excluded.categories,
    print_copies = excluded.print_copies, is_default = excluded.is_default, sort_order = excluded.sort_order,
    is_deleted = 0, updated_at = ${NOW}, sync_status = 'PENDING'`);

export const clearDefaultKitchenStations = (db: Db) => db.prepare(`
  UPDATE kitchen_stations SET is_default = 0, updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE tenant_id = ? AND station_id != ? AND is_default = 1`);

export const softDeleteKitchenStation = (db: Db) => db.prepare(`
  UPDATE kitchen_stations SET is_deleted = 1, updated_at = ${NOW}, sync_status = 'PENDING' WHERE station_id = ? AND tenant_id = ?`);

export const listModifierGroups = (db: Db) => db.prepare(`
  SELECT * FROM modifier_groups WHERE tenant_id = ? AND is_deleted = 0 ORDER BY sort_order, name`);

export const upsertModifierGroup = (db: Db) => db.prepare(`
  INSERT INTO modifier_groups (group_id, tenant_id, name, min_select, max_select, categories, product_ids, sort_order, sync_status)
  VALUES (@group_id, @tenant_id, @name, @min_select, @max_select, @categories, @product_ids, @sort_order, 'PENDING')
  ON CONFLICT(group_id) DO UPDATE SET name = excluded.name, min_select = excluded.min_select,
    max_select = excluded.max_select, categories = excluded.categories, product_ids = excluded.product_ids,
    sort_order = excluded.sort_order, is_deleted = 0, updated_at = ${NOW}, sync_status = 'PENDING'`);

export const softDeleteModifierGroup = (db: Db) => db.prepare(`
  UPDATE modifier_groups SET is_deleted = 1, updated_at = ${NOW}, sync_status = 'PENDING' WHERE group_id = ? AND tenant_id = ?`);

export const softDeleteModifiersOfGroup = (db: Db) => db.prepare(`
  UPDATE modifiers SET is_deleted = 1, updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE group_id = ? AND tenant_id = ? AND is_deleted = 0`);

export const listModifiers = (db: Db) => db.prepare(`
  SELECT * FROM modifiers WHERE tenant_id = ? AND is_deleted = 0 ORDER BY group_id, sort_order, name`);

export const upsertModifier = (db: Db) => db.prepare(`
  INSERT INTO modifiers (modifier_id, tenant_id, group_id, name, price, tax_rate, sort_order, is_active, sync_status)
  VALUES (@modifier_id, @tenant_id, @group_id, @name, @price, @tax_rate, @sort_order, @is_active, 'PENDING')
  ON CONFLICT(modifier_id) DO UPDATE SET group_id = excluded.group_id, name = excluded.name, price = excluded.price,
    tax_rate = excluded.tax_rate, sort_order = excluded.sort_order, is_active = excluded.is_active, is_deleted = 0,
    updated_at = ${NOW}, sync_status = 'PENDING'`);

export const softDeleteModifier = (db: Db) => db.prepare(`
  UPDATE modifiers SET is_deleted = 1, updated_at = ${NOW}, sync_status = 'PENDING' WHERE modifier_id = ? AND tenant_id = ?`);

// ── Counters (terminal-local) ─────────────────────────────────────────────────

export const nextCounterValue = (db: Db) => db.prepare(`
  INSERT INTO restaurant_counters (counter_key, value) VALUES (?, 1)
  ON CONFLICT(counter_key) DO UPDATE SET value = value + 1
  RETURNING value`);

export const findTerminalCode = (db: Db) => db.prepare(`
  SELECT value FROM settings WHERE key = 'terminal_code' AND tenant_id IN (?, 'global')
  ORDER BY CASE WHEN tenant_id = 'global' THEN 1 ELSE 0 END LIMIT 1`);

// ── Orders ─────────────────────────────────────────────────────────────────────

export const listActiveOrders = (db: Db) => db.prepare(`
  SELECT * FROM restaurant_orders WHERE tenant_id = ? AND is_deleted = 0 AND status IN ('OPEN', 'BILLING')
  ORDER BY opened_at`);

export const listRecentClosedOrders = (db: Db) => db.prepare(`
  SELECT * FROM restaurant_orders WHERE tenant_id = ? AND is_deleted = 0 AND status IN ('SETTLED', 'CANCELLED')
    AND business_date = ? ORDER BY closed_at DESC LIMIT 200`);

export const findOrder = (db: Db) => db.prepare(`SELECT * FROM restaurant_orders WHERE order_id = ?`);

export const findActiveOrderOnTable = (db: Db) => db.prepare(`
  SELECT * FROM restaurant_orders WHERE tenant_id = ? AND table_id = ? AND is_deleted = 0 AND status IN ('OPEN', 'BILLING')
  ORDER BY opened_at LIMIT 1`);

export const insertOrder = (db: Db) => db.prepare(`
  INSERT INTO restaurant_orders (order_id, tenant_id, order_no, order_type, table_id, covers, waiter_user_id, waiter_name,
    customer_name, customer_phone, delivery_address, channel, channel_ref, delivery_fee, status, parent_order_id, note,
    opened_by, opened_at, business_date, sync_status)
  VALUES (@order_id, @tenant_id, @order_no, @order_type, @table_id, @covers, @waiter_user_id, @waiter_name,
    @customer_name, @customer_phone, @delivery_address, @channel, @channel_ref, @delivery_fee, 'OPEN', @parent_order_id, @note,
    @opened_by, ${NOW}, @business_date, 'PENDING')`);

export const updateOrderDetails = (db: Db) => db.prepare(`
  UPDATE restaurant_orders SET covers = @covers, waiter_user_id = @waiter_user_id, waiter_name = @waiter_name,
    customer_name = @customer_name, customer_phone = @customer_phone, delivery_address = @delivery_address,
    channel = @channel, channel_ref = @channel_ref, delivery_fee = @delivery_fee, note = @note,
    updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE order_id = @order_id AND status IN ('OPEN', 'BILLING')`);

export const updateOrderTable = (db: Db) => db.prepare(`
  UPDATE restaurant_orders SET table_id = ?, updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE order_id = ? AND status = 'OPEN'`);

/** Takes the billing claim: an open order, a claim this terminal already holds, or a claim older than `staleBefore`. */
export const claimOrderForBilling = (db: Db) => db.prepare(`
  UPDATE restaurant_orders SET status = 'BILLING', billing_terminal = @terminal, billing_since = ${NOW},
    updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE order_id = @order_id AND (status = 'OPEN'
    OR (status = 'BILLING' AND (billing_terminal = @terminal OR billing_since IS NULL OR billing_since < @stale_before)))`);

export const releaseBillingClaim = (db: Db) => db.prepare(`
  UPDATE restaurant_orders SET status = 'OPEN', billing_terminal = NULL, billing_since = NULL,
    updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE order_id = ? AND status = 'BILLING'`);

export const settleOrder = (db: Db) => db.prepare(`
  UPDATE restaurant_orders SET status = 'SETTLED', invoice_id = ?, invoice_number = ?, closed_at = ${NOW},
    updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE order_id = ? AND status IN ('OPEN', 'BILLING')`);

export const cancelOrder = (db: Db) => db.prepare(`
  UPDATE restaurant_orders SET status = 'CANCELLED', cancel_reason = ?, merged_into_order_id = ?, closed_at = ${NOW},
    updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE order_id = ? AND status IN ('OPEN', 'BILLING', 'PENDING_APPROVAL')`);

// ── Lines ──────────────────────────────────────────────────────────────────────

export const listLinesOfActiveOrders = (db: Db) => db.prepare(`
  SELECT l.* FROM restaurant_order_lines l JOIN restaurant_orders o ON o.order_id = l.order_id
  WHERE o.tenant_id = ? AND o.is_deleted = 0 AND o.status IN ('OPEN', 'BILLING') AND l.is_deleted = 0
  ORDER BY l.created_at, l.line_id`);

export const listLinesOfOrder = (db: Db) => db.prepare(`
  SELECT * FROM restaurant_order_lines WHERE order_id = ? AND is_deleted = 0 ORDER BY created_at, line_id`);

export const findLine = (db: Db) => db.prepare(`SELECT * FROM restaurant_order_lines WHERE line_id = ?`);

export const insertLine = (db: Db) => db.prepare(`
  INSERT INTO restaurant_order_lines (line_id, tenant_id, order_id, product_id, name, category, quantity, unit_price,
    tax_rate, modifiers, note, seat, station_id, kot_id, status, moved_from_line_id, created_by, created_at, sync_status)
  VALUES (@line_id, @tenant_id, @order_id, @product_id, @name, @category, @quantity, @unit_price,
    @tax_rate, @modifiers, @note, @seat, @station_id, @kot_id, 'ACTIVE', @moved_from_line_id, @created_by,
    COALESCE(@created_at, ${NOW}), 'PENDING')`);

export const voidLine = (db: Db) => db.prepare(`
  UPDATE restaurant_order_lines SET status = 'VOIDED', void_reason = ?, voided_by = ?, voided_at = ${NOW},
    void_kot_id = ?, updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE line_id = ? AND status = 'ACTIVE'`);

// ── KOT tickets ────────────────────────────────────────────────────────────────

export const insertKot = (db: Db) => db.prepare(`
  INSERT INTO kot_tickets (kot_id, tenant_id, order_id, kot_no, kind, station_id, station_name, kds_status,
    created_by, business_date, sync_status)
  VALUES (@kot_id, @tenant_id, @order_id, @kot_no, @kind, @station_id, @station_name, @kds_status,
    @created_by, @business_date, 'PENDING')`);

export const findKot = (db: Db) => db.prepare(`SELECT * FROM kot_tickets WHERE kot_id = ?`);

export const listKotsOfActiveOrders = (db: Db) => db.prepare(`
  SELECT k.* FROM kot_tickets k JOIN restaurant_orders o ON o.order_id = k.order_id
  WHERE o.tenant_id = ? AND o.is_deleted = 0 AND o.status IN ('OPEN', 'BILLING') AND k.is_deleted = 0
  ORDER BY k.created_at`);

export const listKotsOfOrder = (db: Db) => db.prepare(`
  SELECT * FROM kot_tickets WHERE order_id = ? AND is_deleted = 0 ORDER BY created_at`);

export const listLinesOfKot = (db: Db) => db.prepare(`
  SELECT * FROM restaurant_order_lines WHERE (kot_id = ? OR void_kot_id = ?) AND is_deleted = 0 ORDER BY created_at, line_id`);

export const markKotPrinted = (db: Db) => db.prepare(`
  UPDATE kot_tickets SET printed_at = CASE WHEN ? IS NULL THEN ${NOW} ELSE printed_at END, print_error = ?,
    updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE kot_id = ?`);

export const updateKdsStatus = (db: Db) => db.prepare(`
  UPDATE kot_tickets SET kds_status = ?, kds_updated_at = ${NOW}, updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE kot_id = ?`);

/** Kitchen display: unfinished tickets of the shop (orders still open or billed today) with their order header. */
export const listKdsTickets = (db: Db) => db.prepare(`
  SELECT k.*, o.order_no, o.order_type, o.table_id, o.waiter_name, o.customer_name, o.note AS order_note
  FROM kot_tickets k JOIN restaurant_orders o ON o.order_id = k.order_id
  WHERE k.tenant_id = ? AND k.is_deleted = 0 AND k.kind = 'NEW' AND k.kds_status IN ('NEW', 'PREPARING', 'READY')
    AND o.status != 'CANCELLED' AND k.business_date >= ?
  ORDER BY k.created_at`);

/** Lines shown on the kitchen display for the tickets above: moved originals are hidden (their copies show). */
export const listKdsLines = (db: Db) => db.prepare(`
  SELECT l.* FROM restaurant_order_lines l JOIN kot_tickets k ON k.kot_id = l.kot_id
  WHERE k.tenant_id = ? AND k.is_deleted = 0 AND k.kind = 'NEW' AND k.kds_status IN ('NEW', 'PREPARING', 'READY')
    AND k.business_date >= ? AND l.is_deleted = 0 AND NOT (l.status = 'VOIDED' AND l.void_reason = 'MOVED')
  ORDER BY l.created_at, l.line_id`);

// ── Reports ────────────────────────────────────────────────────────────────────

export const salesByOrderType = (db: Db) => db.prepare(`
  SELECT o.order_type, o.channel, COUNT(*) AS orders, COALESCE(SUM(i.grand_total), 0) AS total,
    COALESCE(SUM(o.covers), 0) AS covers
  FROM restaurant_orders o JOIN invoices i ON i.invoice_id = o.invoice_id
  WHERE o.tenant_id = ? AND o.status = 'SETTLED' AND o.business_date BETWEEN ? AND ? AND COALESCE(i.is_deleted, 0) = 0
  GROUP BY o.order_type, o.channel ORDER BY total DESC`);

export const salesByWaiter = (db: Db) => db.prepare(`
  SELECT COALESCE(o.waiter_name, '') AS waiter_name, COUNT(*) AS orders, COALESCE(SUM(i.grand_total), 0) AS total,
    COALESCE(SUM(o.covers), 0) AS covers
  FROM restaurant_orders o JOIN invoices i ON i.invoice_id = o.invoice_id
  WHERE o.tenant_id = ? AND o.status = 'SETTLED' AND o.business_date BETWEEN ? AND ? AND COALESCE(i.is_deleted, 0) = 0
  GROUP BY COALESCE(o.waiter_name, '') ORDER BY total DESC`);

export const voidsByReason = (db: Db) => db.prepare(`
  SELECT COALESCE(l.void_reason, '') AS reason, COUNT(*) AS lines, COALESCE(SUM(l.quantity * l.unit_price), 0) AS value
  FROM restaurant_order_lines l JOIN restaurant_orders o ON o.order_id = l.order_id
  WHERE o.tenant_id = ? AND o.business_date BETWEEN ? AND ? AND l.status = 'VOIDED' AND l.is_deleted = 0
    AND COALESCE(l.void_reason, '') NOT IN ('MOVED')
  GROUP BY COALESCE(l.void_reason, '') ORDER BY value DESC`);

// ── Helpers used by the order service ──────────────────────────────────────────

export const findTerminalOrigin = (db: Db) => db.prepare(`SELECT value FROM sync_meta WHERE key = 'origin'`);

export const findDiningTable = (db: Db) => db.prepare(`SELECT * FROM dining_tables WHERE table_id = ?`);

export const addOrderCovers = (db: Db) => db.prepare(`
  UPDATE restaurant_orders SET covers = covers + ?, updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE order_id = ? AND status IN ('OPEN', 'BILLING')`);

export const moveKotsToOrder = (db: Db) => db.prepare(`
  UPDATE kot_tickets SET order_id = ?, updated_at = ${NOW}, sync_status = 'PENDING' WHERE order_id = ?`);

export const listActiveLinesOfKot = (db: Db) => db.prepare(`
  SELECT * FROM restaurant_order_lines WHERE kot_id = ? AND status = 'ACTIVE' AND is_deleted = 0 ORDER BY created_at, line_id`);

export const listVoidedLinesOfKot = (db: Db) => db.prepare(`
  SELECT * FROM restaurant_order_lines WHERE void_kot_id = ? AND is_deleted = 0 ORDER BY created_at, line_id`);

// ── Online Orders ────────────────────────────────────────────────────────────

export const listPendingOnlineOrders = (db: Db) => db.prepare(`
  SELECT * FROM restaurant_orders
  WHERE tenant_id = ? AND status = 'PENDING_APPROVAL' AND is_deleted = 0
  ORDER BY created_at DESC`);

export const acceptPendingOnlineOrder = (db: Db) => db.prepare(`
  UPDATE restaurant_orders
  SET status = 'OPEN', opened_by = COALESCE(?, opened_by), updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE order_id = ? AND status = 'PENDING_APPROVAL'`);

export const assignLineToKot = (db: Db) => db.prepare(`
  UPDATE restaurant_order_lines SET kot_id = ?, station_id = ?, updated_at = ${NOW}, sync_status = 'PENDING'
  WHERE line_id = ?`);


