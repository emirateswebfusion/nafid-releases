import { useState } from 'react';
import { ChefHat, LayoutGrid, ListPlus, Percent } from 'lucide-react';
import type { RestaurantData } from '../hooks/useRestaurantData';
import { TablesSetup } from './TablesSetup';
import { StationsSetup } from './StationsSetup';
import { ModifiersSetup } from './ModifiersSetup';
import { ServiceChargeSetup } from './ServiceChargeSetup';

type SetupTab = 'tables' | 'stations' | 'modifiers' | 'service';

const TABS: { key: SetupTab; label: string; hint: string; icon: typeof LayoutGrid }[] = [
  { key: 'tables', label: 'Tables', hint: 'Tables and seating areas', icon: LayoutGrid },
  { key: 'stations', label: 'Kitchen & printers', hint: 'Stations, their categories and printer on this PC', icon: ChefHat },
  { key: 'modifiers', label: 'Add-ons', hint: 'Extras and choices offered with items', icon: ListPlus },
  { key: 'service', label: 'Service charge', hint: 'Optional charge and its tax rate', icon: Percent },
];

interface RestaurantSetupViewProps {
  tenantId: string;
  data: RestaurantData;
  categories: string[];
  onChanged: () => void;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
}

/** Restaurant setup with a side menu: one section at a time, each in its own card. */
export function RestaurantSetupView({ tenantId, data, categories, onChanged, onError, onInfo }: RestaurantSetupViewProps) {
  const [tab, setTab] = useState<SetupTab>('tables');
  const current = TABS.find(t => t.key === tab)!;
  return (
    <div className="flex min-h-0 gap-5 p-5">
      <aside className="w-64 shrink-0 space-y-1">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${tab === t.key ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted'}`}>
            <t.icon className={`mt-0.5 h-5 w-5 shrink-0 ${tab === t.key ? 'text-primary' : 'text-muted-foreground'}`} />
            <span><span className="block text-sm font-bold">{t.label}</span><span className="block text-xs text-muted-foreground">{t.hint}</span></span>
          </button>
        ))}
      </aside>
      <section className="min-w-0 flex-1 rounded-3xl border border-border/70 bg-card p-6">
        <h2 className="text-lg font-black">{current.label}</h2>
        <p className="mb-5 text-sm text-muted-foreground">{current.hint}</p>
        {tab === 'tables' && <TablesSetup tenantId={tenantId} tables={data.setup.tables} onChanged={onChanged} onError={onError} />}
        {tab === 'stations' && <StationsSetup tenantId={tenantId} stations={data.setup.stations} categories={categories} onChanged={onChanged} onError={onError} onInfo={onInfo} />}
        {tab === 'modifiers' && <ModifiersSetup tenantId={tenantId} groups={data.setup.modifierGroups} modifiers={data.setup.modifiers} categories={categories} onChanged={onChanged} onError={onError} />}
        {tab === 'service' && <ServiceChargeSetup tenantId={tenantId} value={data.serviceCharge} onChanged={onChanged} onError={onError} />}
      </section>
    </div>
  );
}
