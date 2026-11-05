import { Store, LayoutGrid, Check, Save, Loader2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { SettingsCard } from '../views/SettingsControls';
import { useState } from 'react';
import { FEATURE_LIST, DEFAULT_FEATURE_FLAGS, sanitizeFeatureFlags, type FeatureFlags, type FeatureKey, useFeatureFlagsStore } from '../../../config/featureFlags';
import { BUSINESS_PROFILES, flagsForBusinessProfile, matchingBusinessProfile } from '../../../config/businessProfiles';
import { useAuthStore } from '../../../store/authStore';
import { setSetting } from '../../../data/settings';
import { syncApi } from '../../../data/sync';

export interface FeaturesTabProps {
  featureFlags: FeatureFlags | null;
  onSaved?: (flags: FeatureFlags) => void;
  handleToggleFeatureFlag: (key: FeatureKey, nextVal?: boolean) => void;
  setConfirmTurnOffAllModalOpen: (v: boolean) => void;
  setShowCashRegister: (v: boolean) => void;
}

/** Category recommendations are a starting selection; owners keep full control of every module. */
export function FeaturesTab({ featureFlags, setShowCashRegister, onSaved }: FeaturesTabProps) {
  const tenantId = useAuthStore(s => s.tenantId);
  const [draft, setDraft] = useState(() => ({ ...DEFAULT_FEATURE_FLAGS, ...featureFlags }));
  const [category, setCategory] = useState(() => matchingBusinessProfile(featureFlags));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const toggle = (key: FeatureKey, checked: boolean) => {
    setCategory('custom');
    setDraft(current => sanitizeFeatureFlags({ ...current, [key]: checked,
      ...(key === 'cash_register' && checked ? { cash_settlement: true } : {}),
      ...(['dining_tables', 'takeaway_delivery', 'kitchen_display'].includes(key) && checked ? { restaurant_mode: true } : {}),
    }));
    setMessage('');
  };
  const save = async () => {
    if (!tenantId) return;
    setSaving(true); setMessage('');
    const flags = sanitizeFeatureFlags(draft);
    try {
      await setSetting({ tenant_id: tenantId, key: 'feature_flags', value: flags });
      // Legacy consumers share these aliases; the feature record remains authoritative.
      await setSetting({ tenant_id: tenantId, key: 'enable_scrap', value: flags.scrap });
      await setSetting({ tenant_id: tenantId, key: 'show_cash_register', value: flags.cash_register });
      useFeatureFlagsStore.getState().setFlags(flags);
      setShowCashRegister(flags.cash_register);
      onSaved?.(flags);
      window.dispatchEvent(new Event('settings:updated'));
      setMessage('Saved for this shop. Other terminals receive these choices when they sync. Offline terminals update when they reconnect.');
      void syncApi.runInitialSync().catch(error => console.error('[Features] Sync pending', error));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save modules. Please try again.');
    } finally { setSaving(false); }
  };
  return (
    <div className="space-y-6">
      <SettingsCard icon={Store} title="Choose what your shop needs" subtitle="Start with your business category, then customize the pages below. Your existing records are kept.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Business category">
          {BUSINESS_PROFILES.map(profile => <button key={profile.id} type="button" disabled={saving}
            aria-pressed={category === profile.id}
            onClick={() => { setCategory(profile.id); setDraft(flagsForBusinessProfile(profile.id)); setMessage(''); }}
            className={`relative min-h-[104px] rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${category === profile.id ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-background hover:border-primary/30 hover:bg-muted/30'}`}>
            <span className="flex items-center justify-between gap-2 text-xs font-bold text-foreground">{profile.name}{category === profile.id && <Check className="h-4 w-4 shrink-0 text-primary" />}</span><span className="mt-2 block text-[11px] leading-relaxed text-muted-foreground">{profile.description}</span>
          </button>)}
        </div>
        <p className="mt-4 text-[11px] font-medium text-muted-foreground">{category === 'custom' ? 'Custom selection' : 'Recommended selection'} · {FEATURE_LIST.filter(f => draft[f.key]).length} modules selected</p>
      </SettingsCard>
      <SettingsCard icon={LayoutGrid} title="Pages & features" subtitle="Select only the tools your shop uses. You can change these choices at any time.">
        <div className="grid gap-3 md:grid-cols-2">
          {FEATURE_LIST.map(def => <label key={def.key} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${draft[def.key] ? 'border-primary/20 bg-primary/[0.03]' : 'border-border bg-background hover:bg-muted/20'}`}>
            <input type="checkbox" checked={draft[def.key]} disabled={saving} onChange={e => toggle(def.key, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary focus-visible:ring-2 focus-visible:ring-primary" />
            <span><span className="block text-xs font-bold">{def.label}</span><span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{def.desc}</span></span>
          </label>)}
        </div>
      </SettingsCard>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur-sm">
        <Button type="button" onClick={() => void save()} disabled={saving || !tenantId}>
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}{saving ? 'Saving…' : 'Save shop modules'}
        </Button>
        <span className="text-xs text-muted-foreground">Applies to dashboard, billing and page access.</span>
        {message && <p role="status" className="w-full text-sm">{message}</p>}
      </div>
    </div>
  );
}
