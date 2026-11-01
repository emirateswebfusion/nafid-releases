import { settingsApi } from '../data/settings';

/** Signup defaults must never replace newer local/offline shop edits on subsequent logins. */
export async function initializeTrialProfile(tenantId: string, profile: Record<string, unknown>) {
  for (const key of ['store_country', 'store_timezone', 'shop_phone', 'shop_address']) {
    if (typeof profile[key] !== 'string') continue;
    const existing = await settingsApi.get({ tenant_id: tenantId, key, tenant_only: true });
    if (existing === null || existing === undefined) await settingsApi.set({ tenant_id: tenantId, key, value: profile[key] });
  }
}
