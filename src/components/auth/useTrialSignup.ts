import { useEffect, useState } from 'react';
import { trialsCloud } from '../../data/cloud/trials';
import { useAuthStore } from '../../store/authStore';
import { flagsForBusinessProfile } from '../../config/businessProfiles';
import { useFeatureFlagsStore } from '../../config/featureFlags';
import { isDesktopRuntime } from '../../data/client';
import { settingsApi } from '../../data/settings';
import type { TrialShopDetails } from './trialShopDetails';

export function useTrialSignup() {
  const [days, setDays] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  useEffect(() => {
    let active = true;
    trialsCloud.policy().then(policy => { if (active) setDays(policy.default_days); })
      .catch(() => { if (active) setError('Unable to load trial availability. Please check your connection and reopen sign up.'); });
    return () => { active = false; };
  }, []);
  const submit = async (details: TrialShopDetails) => {
    if (busy || created) return;
    setError('');
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) { setError('Use a password of at least 8 characters and no more than 72 bytes.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const category = details.businessCategory || 'retail';
    const flags = flagsForBusinessProfile(category);
    try {
      await trialsCloud.register({
        shop_name: details.shopName.trim(), owner_name: details.ownerName.trim(), owner_email: details.email.trim().toLowerCase(),
        owner_password: password, phone: details.phone.trim(), city: details.city.trim(), country: details.country,
        business_category: category, feature_flags: flags,
      });
      setCreated(true);
      const result = await useAuthStore.getState().login(details.email.trim().toLowerCase(), password);
      setPassword(''); setConfirmPassword('');
      if (!result.success) {
        setError(`Your account was created. Sign in to continue. ${result.error || ''}`);
        return;
      }
      const tenantId = useAuthStore.getState().tenantId;
      if (tenantId) {
        if (isDesktopRuntime()) {
          try {
            await settingsApi.set({ tenant_id: tenantId, key: 'feature_flags', value: flags });
            await settingsApi.set({ tenant_id: tenantId, key: 'business_category', value: category });
          } catch (err) {
            console.warn('[Trial] Could not save initial feature flags', err);
          }
        }
        useFeatureFlagsStore.getState().setFlags(flags);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create your trial. Please try again.'); }
    finally { setBusy(false); }
  };
  return { days, password, setPassword, confirmPassword, setConfirmPassword, busy, error, created, submit };
}
