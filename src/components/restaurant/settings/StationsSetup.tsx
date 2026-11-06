import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { restaurantApi, parseTextList, type KitchenStation } from '../../../data/restaurant';

interface StationsSetupProps {
  api?: typeof restaurantApi;
  tenantId: string;
  stations: KitchenStation[];
  categories: string[];
  onChanged: () => void;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
}

const input = 'rounded-lg border border-border bg-background px-2 py-1 text-sm';

/**
 * Kitchen stations (shared by all terminals): name, the product categories they cook, copies, default station.
 * The printer of each station is set per terminal and stays on this PC.
 */
export function StationsSetup({ api = restaurantApi, tenantId, stations, categories, onChanged, onError }: StationsSetupProps) {
  const [newName, setNewName] = useState('');

  const save = async (station: Partial<KitchenStation> & { categoriesList?: string[] }) => {
    const { categoriesList, ...rest } = station;
    const result = await api.saveStation({ tenant_id: tenantId, ...rest, categories: categoriesList ?? parseTextList(station.categories ?? '[]') });
    if (!result.success) onError(result.error); else onChanged();
  };

  const assigned = new Set(stations.flatMap(s => parseTextList(s.categories).map(c => c.toLowerCase())));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
        <input className={`${input} w-48`} placeholder="New station, e.g. Grill" value={newName} onChange={e => setNewName(e.target.value)} />
        <Button disabled={!newName.trim()} onClick={() => { void save({ name: newName.trim(), is_default: stations.length === 0 ? 1 : 0, categoriesList: [] }); setNewName(''); }}><Plus className="mr-1 h-4 w-4" />Add station</Button>

      </div>
      {stations.length === 0 && <p className="text-sm text-muted-foreground">Add a preparation area such as Grill or Drinks, then choose which menu categories it handles. Printer connections are configured in Printers & Devices.</p>}
      {stations.map(s => {
        const cats = parseTextList(s.categories);
        return (
          <div key={s.station_id} className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${input} w-40 font-bold`} aria-label="Station name" value={s.name} onChange={e => e.target.value !== s.name && void save({ ...s, name: e.target.value.trim() })} />
              <label className="text-xs"><input type="checkbox" checked={!!s.is_default} onChange={e => void save({ ...s, is_default: e.target.checked ? 1 : 0 })} /> Default (unlisted categories)</label>
              <label className="text-xs">Copies <input className={`${input} w-12`} value={s.print_copies} onChange={e => Number(e.target.value) !== s.print_copies && void save({ ...s, print_copies: Number(e.target.value) || 1 })} /></label>
              <button type="button" aria-label={`Remove ${s.name} station`} className="ml-auto p-1 text-destructive" onClick={async () => {
                const r = await api.deleteStation({ tenant_id: tenantId, station_id: s.station_id });
                if (!r.success) onError(r.error); else onChanged();
              }}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map(c => {
                const on = cats.some(x => x.toLowerCase() === c.toLowerCase());
                return (
                  <button key={c} type="button" onClick={() => void save({ ...s, categoriesList: on ? cats.filter(x => x.toLowerCase() !== c.toLowerCase()) : [...cats, c] })}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${on ? 'bg-primary text-primary-foreground' : assigned.has(c.toLowerCase()) ? 'bg-muted text-muted-foreground line-through' : 'bg-muted'}`}>{c}</button>
                );
              })}
            </div>

          </div>
        );
      })}
    </div>
  );
}
