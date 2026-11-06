import { useEffect, useState } from 'react';
import { restaurantApi, type KitchenPrinterConfig, type KitchenPrinterTarget, type KitchenStation } from '../../../data/restaurant';
import { useAuthStore } from '../../../store/authStore';
import { useSettingsSectionSave } from '../hooks/useSettingsSectionSave';
import { Button } from '../../ui/Button';
const input = 'rounded-lg border border-border bg-background px-3 py-2 text-sm';
/** Device-local kitchen printer connections live alongside receipt and barcode printers. */
export function KitchenPrinterSettings() {
  const tenantId = useAuthStore(s => s.tenantId) || 'global';
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [config, setConfig] = useState<KitchenPrinterConfig>({ widthMm: 80, stations: {} });
  const [saved, setSaved] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([restaurantApi.getSetup({ tenant_id: tenantId }), restaurantApi.getPrinterConfig()]).then(([setup, printers]) => {
      if (active) { setStations(setup.stations); setConfig(printers); setSaved(JSON.stringify(printers)); }
    }).catch(error => { if (active) setMessage(String(error)); });
    return () => { active = false; };
  }, [tenantId]);
  useSettingsSectionSave(!!saved && JSON.stringify(config) !== saved, async () => {
    const result = await restaurantApi.savePrinterConfig(config);
    if (!result.success) throw new Error(result.error);
    setSaved(JSON.stringify(config));
  });
  const setTarget = (id: string, target: KitchenPrinterTarget) => setConfig(current => ({ ...current, stations: { ...current.stations, [id]: target } }));
  return <div className="space-y-5">
    <div><h3 className="text-sm font-bold">Kitchen ticket printers</h3><p className="mt-1 text-xs text-muted-foreground">Choose where kitchen order tickets print from this computer. Create kitchen stations in Tables, Kitchen & Food Orders first, then save before assigning printers here.</p></div>
    <label className="block text-xs font-semibold">Paper width <select className={input} value={config.widthMm} onChange={e => setConfig({ ...config, widthMm: Number(e.target.value) === 58 ? 58 : 80 })}><option value={80}>80 mm</option><option value={58}>58 mm</option></select></label>
    {!stations.length && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No saved kitchen stations. Add a station such as Grill or Drinks in Food Orders settings.</p>}
    {stations.map(s => { const target = config.stations[s.station_id] ?? { type: 'none' as const }; return <section key={s.station_id} className="rounded-xl border border-border p-4"><h4 className="mb-3 text-sm font-semibold">{s.name}</h4>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold">Printer on this terminal:</span>
              <select aria-label={`Printer for ${s.name}`} className={input} value={target.type} onChange={e => setTarget(s.station_id, e.target.value === 'network' ? { type: 'network', ip: '', port: 9100 } : e.target.value === 'usb' ? { type: 'usb', deviceName: '' } : { type: 'none' })}>
                <option value="none">None</option><option value="network">Network (IP)</option><option value="usb">Windows printer</option>
              </select>
              {target.type === 'network' && (
                <>
                  <input className={`${input} w-36`} placeholder="192.168.1.50" value={target.ip} onChange={e => setTarget(s.station_id, { type: 'network', ip: e.target.value.trim(), port: target.port })} />
                  <input className={`${input} w-20`} value={target.port} onChange={e => setTarget(s.station_id, { type: 'network', ip: target.ip, port: Number(e.target.value) || 9100 })} />
                </>
              )}
              {target.type === 'usb' && (
                <input className={`${input} w-56`} placeholder="Windows printer name" value={target.deviceName} onChange={e => setTarget(s.station_id, { type: 'usb', deviceName: e.target.value.trim() })} />
              )}
              {target.type !== 'none' && (
                <Button size="sm" variant="outline" onClick={async () => {
                  const r = await restaurantApi.testPrinter({ tenant_id: tenantId, station_name: s.name, target });
                  if (r.success) setMessage('Test ticket sent'); else setMessage(r.error);
                }}>Test print</Button>
              )}
            </div>
    </section>; })}
    {message && <p role="status" className="text-sm">{message}</p>}
    <p className="text-xs text-muted-foreground">Connections apply with the main Save Changes button. Test print sends one sample ticket using the selected connection.</p>
  </div>;
}
