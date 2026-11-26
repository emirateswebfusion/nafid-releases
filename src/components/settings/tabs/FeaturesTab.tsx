import { useState } from 'react';
import { Store, LayoutGrid, Check } from 'lucide-react';
import { SettingsCard } from '../views/SettingsControls';
import { FEATURE_LIST, DEFAULT_FEATURE_FLAGS, updateFeatureFlag, type FeatureFlags, type FeatureKey } from '../../../config/featureFlags';
import { BUSINESS_PROFILES, flagsForBusinessProfile, matchingBusinessProfile } from '../../../config/businessProfiles';

export interface FeaturesTabProps {
  disabled?: boolean;
  saveHint?: string;
  featureFlags: FeatureFlags | null;
  onFlagsChange?: (flags: FeatureFlags) => void;
  handleToggleFeatureFlag?: (key: FeatureKey, nextVal?: boolean) => void;
  setConfirmTurnOffAllModalOpen?: (v: boolean) => void;
  setShowCashRegister?: (v: boolean) => void;
}

/** Category recommendations are a starting selection; owners keep full control of every module. */
export function FeaturesTab({ featureFlags, handleToggleFeatureFlag, onFlagsChange, disabled = false, saveHint = "Your selection applies when you press Save Changes at the top of Settings." }: FeaturesTabProps) {
  const draft = { ...DEFAULT_FEATURE_FLAGS, ...featureFlags };
  const category = matchingBusinessProfile(draft);
  const [search, setSearch] = useState('');
  const saving = disabled;
  const food = new Set(['restaurant_mode', 'dining_tables', 'takeaway_delivery', 'kitchen_display']);
  const visible = FEATURE_LIST.filter(feature => `${feature.label} ${feature.desc}`.toLowerCase().includes(search.toLowerCase()));
  const toggle = (key: FeatureKey, checked: boolean) => {
    if (onFlagsChange) onFlagsChange(updateFeatureFlag(draft, key, checked));
    else handleToggleFeatureFlag?.(key, checked);
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4"><div><p className="text-sm font-bold">Your shop workspace</p><p className="mt-1 text-xs text-muted-foreground">Choose a starting category, then fine-tune your tools.</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{FEATURE_LIST.filter(feature => draft[feature.key]).length} of {FEATURE_LIST.length} enabled</span></div>
      <SettingsCard icon={Store} title="Choose what your shop needs" subtitle="Start with your business category, then customize the pages below. Your existing records are kept.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Business category">
          {BUSINESS_PROFILES.map(profile => <button key={profile.id} type="button" disabled={saving}
            aria-pressed={category === profile.id}
            onClick={() => { const flags = flagsForBusinessProfile(profile.id); if (onFlagsChange) onFlagsChange(flags); else FEATURE_LIST.forEach(feature => handleToggleFeatureFlag?.(feature.key, flags[feature.key])); }}
            className={`relative min-h-[104px] rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${category === profile.id ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-background hover:border-primary/30 hover:bg-muted/30'}`}>
            <span className="flex items-center justify-between gap-2 text-xs font-bold text-foreground">{profile.name}{category === profile.id && <Check className="h-4 w-4 shrink-0 text-primary" />}</span><span className="mt-2 block text-[11px] leading-relaxed text-muted-foreground">{profile.description}</span>
          </button>)}
        </div>
        <p className="mt-4 text-[11px] font-medium text-muted-foreground">{category === 'custom' ? 'Custom selection' : 'Recommended selection'} · {FEATURE_LIST.filter(f => draft[f.key]).length} modules selected</p>
      </SettingsCard>
      <SettingsCard icon={LayoutGrid} title="Pages & features" subtitle="Select only the tools your shop uses. You can change these choices at any time.">
        <input aria-label="Search modules" placeholder="Search modules…" value={search} onChange={e => setSearch(e.target.value)} className="mb-5 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm" />
        {['Food service', 'Shop operations'].map(group => <section key={group} className="mb-6"><h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{group}</h3><div className="grid gap-3 md:grid-cols-2">
          {visible.filter(feature => food.has(feature.key) === (group === 'Food service')).map(def => <label key={def.key} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${draft[def.key] ? 'border-primary/20 bg-primary/[0.03]' : 'border-border bg-background hover:bg-muted/20'}`}>
            <input type="checkbox" checked={draft[def.key]} disabled={saving} onChange={e => toggle(def.key, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary focus-visible:ring-2 focus-visible:ring-primary" />
            <span><span className="block text-xs font-bold">{def.label}</span><span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{def.desc}</span></span>
          </label>)}
        </div></section>)}
        {!visible.length && <p className="py-8 text-center text-sm text-muted-foreground">No modules match your search.</p>}
      </SettingsCard>
      <p className="text-xs text-muted-foreground">{saveHint}</p>
    </div>
  );
}
