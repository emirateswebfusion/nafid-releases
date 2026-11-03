import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { restaurantApi, parseTextList, type KitchenPrinterConfig, type KitchenPrinterTarget, type KitchenStation } from '../../../data/restaurant';

interface StationsSetupProps {
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
export function StationsSetup({ tenantId, stations, categories, onChanged, onError, onInfo }: StationsSetupProps) {
  const [config, setConfig] = useState<KitchenPrinterConfig>({ widthMm: 80, stations: {} });
  const [newName, setNewName] = useState('');
  useEffect(() => { restaurantApi.getPrinterConfig().then(setConfig).catch(() => undefined); }, []);

  const save = async (station: Partial<KitchenStation> & { categoriesList?: string[] }) => {
    const { categoriesList, ...rest } = station;
    const result = await restaurantApi.saveStation({ tenant_id: tenantId, ...rest, categories: categoriesList ?? parseTextList(station.categories ?? '[]') });
    if (!result.success) onError(result.error); else onChanged();
  };

  const saveConfig = async (next: KitchenPrinterConfig) => {
    setConfig(next);
    const result = await restaurantApi.savePrinterConfig(next);
    if (!result.success) onError(result.error);
  };

  const setTarget = (stationId: string, target: KitchenPrinterTarget) =>
    void saveConfig({ ...config, stations: { ...config.stations, [stationId]: target } });

  const assigned = new Set(stations.flatMap(s => parseTextList(s.categories).map(c => c.toLowerCase())));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
        <input className={`${input} w-48`} placeholder="New station, e.g. Grill" value={newName} onChange={e => setNewName(e.target.value)} />
        <Button disabled={!newName.trim()} onClick={() => { void save({ name: newName.trim(), is_default: stations.length === 0 ? 1 : 0, categoriesList: [] }); setNewName(''); }}><Plus className="mr-1 h-4 w-4" />Add station</Button>
        <label className="ml-auto text-xs font-bold">Kitchen paper (this terminal)
          <select className={`${input} ml-2`} value={config.widthMm} onChange={e => void saveConfig({ ...config, widthMm: Number(e.target.value) === 58 ? 58 : 80 })}>
            <option value={80}>80 mm</option><option value={58}>58 mm</option>
          </select>
        </label>
      </div>
      {stations.length === 0 && <p className="text-sm text-muted-foreground">Without stations, items are saved but no kitchen ticket is printed.</p>}
      {stations.map(s => {
        const cats = parseTextList(s.categories);
        const target = config.stations[s.station_id] ?? { type: 'none' as const };
        return (
          <div key={s.station_id} className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${input} w-40 font-bold`} defaultValue={s.name} onBlur={e => e.target.value.trim() && e.target.value !== s.name && void save({ ...s, name: e.target.value.trim() })} />
              <label className="text-xs"><input type="checkbox" checked={!!s.is_default} onChange={e => void save({ ...s, is_default: e.target.checked ? 1 : 0 })} /> Default (unlisted categories)</label>
              <label className="text-xs">Copies <input className={`${input} w-12`} defaultValue={s.print_copies} onBlur={e => Number(e.target.value) !== s.print_copies && void save({ ...s, print_copies: Number(e.target.value) || 1 })} /></label>
              <button type="button" className="ml-auto p-1 text-destructive" onClick={async () => {
                const r = await restaurantApi.deleteStation({ tenant_id: tenantId, station_id: s.station_id });
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
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold">Printer on this terminal:</span>
              <select className={input} value={target.type} onChange={e => setTarget(s.station_id, e.target.value === 'network' ? { type: 'network', ip: '', port: 9100 } : e.target.value === 'usb' ? { type: 'usb', deviceName: '' } : { type: 'none' })}>
                <option value="none">None</option><option value="network">Network (IP)</option><option value="usb">Windows printer</option>
              </select>
              {target.type === 'network' && (
                <>
                  <input className={`${input} w-36`} placeholder="192.168.1.50" defaultValue={target.ip} onBlur={e => setTarget(s.station_id, { type: 'network', ip: e.target.value.trim(), port: target.port })} />
                  <input className={`${input} w-20`} defaultValue={target.port} onBlur={e => setTarget(s.station_id, { type: 'network', ip: target.ip, port: Number(e.target.value) || 9100 })} />
                </>
              )}
              {target.type === 'usb' && (
                <input className={`${input} w-56`} placeholder="Windows printer name" defaultValue={target.deviceName} onBlur={e => setTarget(s.station_id, { type: 'usb', deviceName: e.target.value.trim() })} />
              )}
              {target.type !== 'none' && (
                <Button size="sm" variant="outline" onClick={async () => {
                  const r = await restaurantApi.testPrinter({ tenant_id: tenantId, station_name: s.name, target });
                  if (r.success) onInfo('Test ticket sent'); else onError(r.error);
                }}>Test print</Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
