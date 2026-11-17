import { useEffect, useState } from 'react';
import { scanGoCloud, type ScanGoConfig } from '../../data/cloud/scanGo';
import { useSettingsSectionSave } from './hooks/useSettingsSectionSave';

/** The shop switch is a draft until the shared Settings Save Changes action confirms it. */
export function ScanGoSettings() {
  const [saved, setSaved] = useState<ScanGoConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void scanGoCloud.getConfig().then(config => {
      if (active) { setSaved(config); setEnabled(config.enabled); }
    }).catch(() => { if (active) setError('Customer cart settings could not be loaded. Reopen Settings to retry.'); });
    return () => { active = false; };
  }, []);
  useSettingsSectionSave(saved !== null && enabled !== saved.enabled, async () => {
    setError('');
    try {
      const config = await scanGoCloud.setEnabled(enabled);
      setSaved(config);
      window.dispatchEvent(new CustomEvent('scan-go-settings-updated'));
    } catch (failure) {
      setError('Customer cart settings were not saved. Use Save Changes to retry.');
      throw failure;
    }
  });
  return <div className="space-y-4 rounded-2xl border border-border p-5">
    <label className="flex items-center gap-3 font-semibold">
      <input type="checkbox" checked={enabled} disabled={!saved} onChange={event => setEnabled(event.target.checked)} />
      Enable Scan & Go customer carts
    </label>
    <p className="text-sm text-muted-foreground">Customers scan items in the Nafid app and send their cart to the counter. The cashier checks the bill and takes payment. Apply changes with Save Changes.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved?.enabled && saved.qr_svg && <img alt="Shop Scan & Go QR code" className="h-48 w-48 rounded-xl bg-white p-2" src={`data:image/svg+xml;utf8,${encodeURIComponent(saved.qr_svg)}`} />}
  </div>;
}
