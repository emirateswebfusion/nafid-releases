import { useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, ChefHat, LayoutGrid, Settings2, ShoppingBag } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { hasPermission } from '../../utils/security/permissions';
import type { DiningTable, OrderType } from '../../data/restaurant';
import { useRestaurantData } from './hooks/useRestaurantData';
import { useOrderActions } from './hooks/useOrderActions';
import { FloorView } from './views/FloorView';
import { TokenOrdersView } from './views/TokenOrdersView';
import { OrderPanel } from './views/OrderPanel';
import { KitchenDisplay } from './views/KitchenDisplay';
import { RestaurantReportView } from './views/RestaurantReportView';
import { OrderDetailsDialog } from './modals/OrderDetailsDialog';
import { TablesSetup } from './settings/TablesSetup';
import { StationsSetup } from './settings/StationsSetup';
import { ModifiersSetup } from './settings/ModifiersSetup';
import { ServiceChargeSetup } from './settings/ServiceChargeSetup';

type View = 'floor' | 'tokens' | 'kitchen' | 'setup' | 'reports';
type SetupTab = 'tables' | 'stations' | 'modifiers' | 'service';

interface RestaurantPageProps {
  onClose: () => void;
}

/** Restaurant mode screen (feature flag `restaurant_mode`): floor, takeaway / delivery, kitchen display, setup, reports. */
export function RestaurantPage({ onClose }: RestaurantPageProps) {
  const { tenantId, userId, shopName, role, permissions } = useAuthStore();
  const tenant = tenantId || 'global';
  const can = (key: string) => hasPermission({ role, permissions }, key);
  const data = useRestaurantData(tenant);
  const actions = useOrderActions({ tenantId: tenant, userId, shopName: shopName || '', data, onClose });
  const [view, setView] = useState<View>('floor');
  const [setupTab, setSetupTab] = useState<SetupTab>('tables');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opening, setOpening] = useState<{ type: OrderType; table?: DiningTable } | null>(null);
  const categories = useMemo(() => [...new Set(data.products.map(p => p.category).filter((c): c is string => !!c))].sort(), [data.products]);
  const selected = data.active.orders.find(o => o.order_id === selectedId) ?? null;

  const tabs: { key: View; label: string; icon: typeof LayoutGrid; show: boolean }[] = [
    { key: 'floor', label: 'Tables', icon: LayoutGrid, show: true },
    { key: 'tokens', label: 'Takeaway & Delivery', icon: ShoppingBag, show: true },
    { key: 'kitchen', label: 'Kitchen display', icon: ChefHat, show: true },
    { key: 'reports', label: 'Reports', icon: BarChart3, show: can('reports.view') },
    { key: 'setup', label: 'Setup', icon: Settings2, show: can('restaurant.manage') },
  ];

  const refreshAll = () => { void data.refreshSetup(); void data.refreshOrders(); };
  const showError = (text: string) => actions.setMessage({ tone: 'error', text });

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-muted" title="Back to billing"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="mr-4 text-lg font-black">Restaurant</h1>
        {tabs.filter(t => t.show).map(t => (
          <button key={t.key} type="button" onClick={() => { setView(t.key); setSelectedId(null); }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold ${view === t.key ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
        {actions.message && (
          <button type="button" onClick={() => actions.setMessage(null)}
            className={`ml-auto max-w-[40%] truncate rounded-xl px-3 py-1.5 text-xs font-bold ${actions.message.tone === 'error' ? 'bg-destructive/15 text-destructive' : actions.message.tone === 'warn' ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/15 text-emerald-700'}`}>
            {actions.message.text}
          </button>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {data.loading ? <div className="p-10 text-center text-muted-foreground">Loading…</div>
          : selected ? (
            <OrderPanel order={selected} data={data} actions={actions} can={can} onBack={() => setSelectedId(null)} onSelectOrder={setSelectedId} />
          ) : view === 'floor' ? (
            <FloorView tables={data.setup.tables} active={data.active} onOpenOrder={o => setSelectedId(o.order_id)}
              onFreeTable={table => can('restaurant.orders') ? setOpening({ type: 'DINE_IN', table }) : showError('You cannot take orders')} />
          ) : view === 'tokens' ? (
            <TokenOrdersView active={data.active} onOpenOrder={o => setSelectedId(o.order_id)}
              onNew={type => can('restaurant.orders') ? setOpening({ type }) : showError('You cannot take orders')} />
          ) : view === 'kitchen' ? (
            <KitchenDisplay tenantId={tenant} stations={data.setup.stations} />
          ) : view === 'reports' ? (
            <RestaurantReportView tenantId={tenant} />
          ) : (
            <div className="p-4">
              <div className="mb-4 flex gap-2">
                {([['tables', 'Tables'], ['stations', 'Kitchen stations & printers'], ['modifiers', 'Add-ons'], ['service', 'Service charge']] as [SetupTab, string][]).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setSetupTab(k)}
                    className={`rounded-xl px-3 py-1.5 text-sm font-bold ${setupTab === k ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{label}</button>
                ))}
              </div>
              {setupTab === 'tables' && <TablesSetup tenantId={tenant} tables={data.setup.tables} onChanged={refreshAll} onError={showError} />}
              {setupTab === 'stations' && <StationsSetup tenantId={tenant} stations={data.setup.stations} categories={categories} onChanged={refreshAll} onError={showError} onInfo={text => actions.setMessage({ tone: 'ok', text })} />}
              {setupTab === 'modifiers' && <ModifiersSetup tenantId={tenant} groups={data.setup.modifierGroups} modifiers={data.setup.modifiers} categories={categories} onChanged={refreshAll} onError={showError} />}
              {setupTab === 'service' && <ServiceChargeSetup tenantId={tenant} value={data.serviceCharge} onChanged={refreshAll} onError={showError} />}
            </div>
          )}
      </main>

      {opening && (
        <OrderDetailsDialog
          title={opening.type === 'DINE_IN' ? `Table ${opening.table?.label ?? ''}` : opening.type === 'DELIVERY' ? 'New delivery' : 'New takeaway'}
          orderType={opening.type} staff={data.staff} onCancel={() => setOpening(null)}
          onSave={async fields => {
            const order = await actions.openOrder({ ...fields, order_type: opening.type, table_id: opening.table?.table_id ?? null });
            setOpening(null);
            if (order) { await data.refreshOrders(); setSelectedId(order.order_id); }
          }} />
      )}
    </div>
  );
}
