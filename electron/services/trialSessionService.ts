import { setSyncActive } from '../sync/syncWorker.js';
import { clearOfflineSession, readAuthPayload, readOfflineSession, setTerminalLocked, writeAuthPayload } from './authStorage.js';
import { rememberTrialToken } from './trialAccessService.js';
import { localSaveUser } from './localAuthService.js';

export interface TrialRefreshInput {
  expected_token: string; tenant_id: string; user_id: string; token: string;
  role: 'ADMIN' | 'STAFF'; permissions: string[]; user_name: string; restricted_page: string | null;
}

/** Compare and replace in the main process, so a delayed response cannot overwrite a new login. */
export function refreshTrialSession(input: TrialRefreshInput) {
  const stored = readAuthPayload() as (Record<string, unknown> & { jwt_token?: string }) | null;
  const offline = readOfflineSession() as Record<string, unknown> | null;
  const current = stored || offline;
  if (!current || current.tenant_id !== input.tenant_id || current.user_id !== input.user_id || (stored && stored.jwt_token !== input.expected_token)) {
    return { success: false, error: 'Session changed while trial access was being checked.' };
  }
  const payload = { ...current, jwt_token: input.token, role: input.role, permissions: input.permissions,
    user_name: input.user_name, restricted_page: input.restricted_page };
  rememberTrialToken(input.token);
  const plaintext = JSON.stringify(payload);
  if (!writeAuthPayload(plaintext)) return { success: false, error: 'Unable to save trial access.' };
  setTerminalLocked(false);
  if (typeof current.email === 'string') localSaveUser({ user_id: input.user_id, tenant_id: input.tenant_id,
    name: input.user_name, email: current.email, role: input.role, permissions: input.permissions,
    restricted_page: input.restricted_page || undefined });
  clearOfflineSession();
  setSyncActive(true);
  return { success: true };
}
