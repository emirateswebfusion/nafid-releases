import { useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import { TablesSetup } from '../settings/TablesSetup';
import { StationsSetup } from '../settings/StationsSetup';
import { useRestaurantSettingsDraft } from '../settings/useRestaurantSettingsDraft';
import type { RestaurantData } from '../hooks/useRestaurantData';
import { SettingsSaveSession } from '../../settings/settingsSaveSession';
import { SettingsSaveContext } from '../../settings/hooks/useSettingsSectionSave';

/** Operational management lives on the Tables and Kitchen pages, with an explicit save. */
export function RestaurantManageView({ tenantId, data, kitchen, onClose }: { tenantId: string; data: RestaurantData; kitchen: boolean; onClose: () => void }) {
  const [session] = useState(() => new SettingsSaveSession());
  const [, refresh] = useState(0);
  const context = useMemo(() => ({ session, changed: () => refresh(x => x + 1) }), [session]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="mx-auto max-w-5xl space-y-5 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{kitchen ? 'Manage preparation stations' : 'Add & manage tables'}</h2><p className="mt-1 text-sm text-muted-foreground">{kitchen ? 'Choose which menu categories each preparation area handles.' : 'Add seating areas and tables, then return to take an order.'}</p></div><Button variant="outline" onClick={onClose} disabled={busy}>Back</Button></div>
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    <fieldset disabled={busy} className="min-w-0 rounded-2xl border border-border bg-card p-5"><SettingsSaveContext.Provider value={context}><Draft tenantId={tenantId} data={data} kitchen={kitchen} onError={setMessage} /></SettingsSaveContext.Provider></fieldset>
    <Button disabled={busy || !session.dirty} onClick={async () => { setBusy(true); setMessage(''); try { await session.save(); await data.refreshSetup(); onClose(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } }}>{busy ? 'Saving…' : kitchen ? 'Save stations' : 'Save tables'}</Button>
  </div>;
}
function Draft({ tenantId, data, kitchen, onError }: { tenantId: string; data: RestaurantData; kitchen: boolean; onError: (message: string) => void }) {
  const draft = useRestaurantSettingsDraft(tenantId, data.setup, { widthMm: 80, stations: {} });
  const categories = [...new Set(data.products.map(p => p.category).filter((c): c is string => !!c))].sort();
  return kitchen ? <StationsSetup api={draft.api} tenantId={tenantId} stations={draft.setup.stations} categories={categories} onChanged={() => {}} onError={onError} onInfo={onError} /> : <TablesSetup api={draft.api} tenantId={tenantId} tables={draft.setup.tables} onChanged={() => {}} onError={onError} />;
}
