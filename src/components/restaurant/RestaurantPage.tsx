import { TablesManager } from './views/TablesManager';
import { RestaurantManageView } from './views/RestaurantManageView';
import { useFeatureFlagsStore } from '../../config/featureFlags';
import { useCallback, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/security/permissions';
import type { DiningTable, OrderType } from '../../data/restaurant';
import { useRestaurantData } from './hooks/useRestaurantData';
import { useOrderActions } from './hooks/useOrderActions';
import { orderValue } from './restaurantRules';
import { RestaurantToast, RestaurantTopBar, type RestaurantView } from './views/RestaurantChrome';
import { FloorView } from './views/FloorView';
import { TokenOrdersView } from './views/TokenOrdersView';
import { OrderPanel } from './views/OrderPanel';
import { useRestaurantDraftStore } from '../../store/restaurantDraftStore';
import { KitchenDisplay } from './views/KitchenDisplay';
import { OrderDetailsDialog } from './modals/OrderDetailsDialog';

interface RestaurantPageProps {
  onClose: () => void;
  view: RestaurantView;
}

const TITLES: Record<RestaurantView, string> = {
  floor: 'Tables', tokens: 'Takeaway & Delivery', kitchen: 'Kitchen display',
};

/**
 * One operational page selected by the main dashboard: tables, takeaway/delivery or kitchen.
 * Billing, reports and configuration stay in their normal application sections.
 */
export function RestaurantPage({ onClose, view }: RestaurantPageProps) {
  const { tenantId, userId, shopName, role, permissions } = useAuthStore();
  const takeawayEnabled = useFeatureFlagsStore(s => s.flags?.takeaway_delivery);
  const tenant = tenantId || 'global';
  const can = useCallback((key: string) => hasPermission({ role, permissions }, key), [role, permissions]);
  const data = useRestaurantData(tenant);
  const actions = useOrderActions({ tenantId: tenant, userId, shopName: shopName || '', data, onClose });
  const { setMessage } = actions;
  const [managing, setManaging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opening, setOpening] = useState<{ type: OrderType; table?: DiningTable } | null>(null);
  // Unsent items per order live in an app-level store, so leaving an order or this screen does not drop them.
  const drafts = useRestaurantDraftStore(s => s.drafts);
  const billedOrderIds = useRestaurantDraftStore(s => s.billedOrderIds);
  const updateDrafts = useRestaurantDraftStore(s => s.update);
  const markBilled = useRestaurantDraftStore(s => s.markBilled);
  const clearBilled = useRestaurantDraftStore(s => s.clearBilled);
  const selected = data.active.orders.find(o => o.order_id === selectedId) ?? null;

  const { tables, orders, kots, lines } = { tables: data.setup.tables.filter(t => t.is_active), orders: data.active.orders, kots: data.active.kots, lines: data.active.lines };
  const stats = {
    totalTables: tables.length,
    freeTables: tables.filter(t => !orders.some(o => o.table_id === t.table_id)).length,
    openOrders: orders.length,
    ready: kots.filter(k => k.kind === 'NEW' && k.kds_status === 'READY').length,
    openValue: orderValue(lines) + orders.reduce((s, o) => s + o.delivery_fee, 0),
  };
  const clearMessage = useCallback(() => setMessage(null), [setMessage]);
  const showError = (text: string) => setMessage({ tone: 'error', text });
  const startOrder = (type: OrderType, table?: DiningTable) => (can('restaurant.orders') ? setOpening({ type, table }) : showError('You do not have permission to take orders'));

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <div className="flex min-w-0 flex-1 flex-col">
        <RestaurantTopBar title={view === 'floor' ? 'Tables & Orders' : TITLES[view]} view={view} onClose={onClose} stats={stats} subtitle={shopName || undefined} onManage={!selected && view === 'kitchen' && can('restaurant.manage') ? () => setManaging(true) : undefined}
          onNewTakeaway={!selected && takeawayEnabled && (view === 'floor' || view === 'tokens') ? () => startOrder('TAKEAWAY') : undefined}
          onNewDelivery={!selected && takeawayEnabled && (view === 'floor' || view === 'tokens') ? () => startOrder('DELIVERY') : undefined} />
        {view === 'floor' && !selected && <nav aria-label="Tables navigation" className="flex gap-2 border-b border-border bg-card px-6 py-3"><button type="button" aria-current={!managing ? 'page' : undefined} className={`rounded-lg px-4 py-2 text-sm font-semibold ${!managing ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`} onClick={() => setManaging(false)}>Orders & seating</button>{can('restaurant.manage') && <button type="button" aria-current={managing ? 'page' : undefined} className={`rounded-lg px-4 py-2 text-sm font-semibold ${managing ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`} onClick={() => setManaging(true)}>Tables</button>}</nav>}
        <main className="min-h-0 flex-1 overflow-y-auto bg-muted/[0.02]">
          {managing && view === 'floor' ? <TablesManager tenantId={tenant} tables={data.setup.tables} onChanged={data.refreshSetup} /> : managing ? <RestaurantManageView tenantId={tenant} data={data} kitchen={view === 'kitchen'} onClose={() => setManaging(false)} /> : data.loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 p-5">
              {Array.from({ length: 12 }, (_, i) => <div key={i} className="h-[132px] animate-pulse rounded-2xl bg-muted" />)}
            </div>
          ) : selected ? (
            <OrderPanel order={selected} data={data} actions={actions} can={can} onBack={() => setSelectedId(null)} onSelectOrder={setSelectedId}
              drafts={drafts[selected.order_id] ?? []}
              setDrafts={update => updateDrafts(selected.order_id, update)}
              isBilled={Boolean(billedOrderIds[selected.order_id])}
              onMarkBilled={markBilled}
              onClearBilled={clearBilled} />
          ) : view === 'floor' ? (
            <FloorView tables={data.setup.tables} active={data.active} unsentOrderIds={Object.keys(drafts)} billedOrderIds={billedOrderIds} onOpenOrder={o => setSelectedId(o.order_id)}
              onFreeTable={table => startOrder('DINE_IN', table)} onSetup={() => { if (can('restaurant.manage')) setManaging(true); }} />
          ) : view === 'tokens' ? (
            <TokenOrdersView active={data.active} billedOrderIds={billedOrderIds} onOpenOrder={o => setSelectedId(o.order_id)} onNew={type => startOrder(type)} />
          ) : (
            <KitchenDisplay tenantId={tenant} stations={data.setup.stations} />
          )}
        </main>
      </div>

      <RestaurantToast message={actions.message} onClose={clearMessage} />

      {opening && (
        <OrderDetailsDialog
          title={opening.type === 'DINE_IN' ? `Seat guests at ${opening.table?.label ?? ''}` : opening.type === 'DELIVERY' ? 'New delivery' : 'New takeaway'}
          orderType={opening.type} staff={data.staff} onCancel={() => setOpening(null)}
          onSave={async fields => {
            const order = await actions.openOrder({ ...fields, order_type: opening.type, table_id: opening.table?.table_id ?? null });
            if (!order) return false;
            await data.refreshOrders(); setSelectedId(order.order_id); setOpening(null);
            return true;
          }} />
      )}
    </div>
  );
}
