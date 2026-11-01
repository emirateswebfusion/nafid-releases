import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { authApi } from '../../data/auth';
import { hasBridge, isDesktopRuntime } from '../../data/client';
import { trialsCloud } from '../../data/cloud/trials';

function browserTrial(token: string | null) {
  if (!token) return { is_trial: false, allowed: true, token: undefined as string | undefined, error: undefined as string | undefined };
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { trial?: boolean; exp?: number };
    return { is_trial: claims.trial === true, allowed: Number(claims.exp) * 1000 > Date.now(), token, error: 'Connect to the internet and sign in to renew trial access.' };
  } catch { return { is_trial: true, allowed: false, token, error: 'Please sign in again to verify trial access.' }; }
}

function belongsToUser(token: string, userId: string | null): boolean {
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { user_id?: string };
    return Boolean(userId) && claims.user_id === userId;
  } catch { return false; }
}

export function useTrialSession() {
  const tenantId = useAuthStore(state => state.tenantId);
  const userId = useAuthStore(state => state.userId);
  const authenticated = useAuthStore(state => state.isAuthenticated);
  const [result, setResult] = useState<{ tenantId: string; userId: string | null; allowed: boolean; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!authenticated || !tenantId) return;
    let disposed = false;
    let running = false;
    const stillCurrent = () => !disposed && useAuthStore.getState().isAuthenticated && useAuthStore.getState().tenantId === tenantId && useAuthStore.getState().userId === userId;
    const update = (allowed: boolean, error?: string) => { if (stillCurrent()) setResult({ tenantId, userId, allowed, error }); };
    const check = async () => {
      if (running) return;
      running = true;
      try {
        const currentToken = useAuthStore.getState().token;
        if (currentToken && !browserTrial(currentToken).is_trial) { update(true); return; }
        if (isDesktopRuntime() && !hasBridge('authGetTrialAccess')) {
          update(!browserTrial(useAuthStore.getState().token).is_trial, 'Restart Nafid to enable trial access.');
          return;
        }
        const local = isDesktopRuntime() ? await authApi.getTrialAccess({ tenant_id: tenantId }) : browserTrial(useAuthStore.getState().token);
        if (!local.is_trial) { update(true); return; }
        if (!stillCurrent()) return;
        const activeToken = useAuthStore.getState().token;
        const token = activeToken && belongsToUser(activeToken, userId) ? activeToken : local.token;
        if (!token) { update(false, 'Sign in online to verify trial access.'); return; }
        // The cached allowance keeps checkout working while the network request runs.
        update(local.allowed, local.error);
        // A shop-wide allowance is not another staff member's authentication credential.
        if (!belongsToUser(token, useAuthStore.getState().userId)) return;
        try {
          const session = await trialsCloud.session(token);
          if (!stillCurrent()) return;
          if (isDesktopRuntime()) {
            const saved = await authApi.refreshTrialSession({ expected_token: token, token: session.token, tenant_id: tenantId,
              user_id: userId || '', role: session.role, permissions: session.permissions,
              user_name: session.user_name, restricted_page: session.restricted_page });
            if (!saved.success) throw new Error(saved.error || 'Unable to save trial access');
          } else {
            const raw = localStorage.getItem('nafid_pos_auth_session');
            if (raw) localStorage.setItem('nafid_pos_auth_session', JSON.stringify({ ...JSON.parse(raw), jwt_token: session.token, role: session.role, user_name: session.user_name, restricted_page: session.restricted_page }));
          }
          if (!stillCurrent()) return;
          useAuthStore.setState({ token: session.token, role: session.role, permissions: session.permissions, isCloudSyncPaused: false, cloudSyncReason: null,
            userName: session.user_name, restrictedPage: session.restricted_page });
          useCartStore.getState().setRole(session.role);
          if (!local.allowed) window.dispatchEvent(new Event('settings:updated'));
          update(true);
        } catch (error) {
          if (!stillCurrent()) return;
          const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
          if (status === 403 || status === 401) {
            if (isDesktopRuntime() && status === 403) await authApi.blockTrialAccess({ tenant_id: tenantId });
            update(false, error instanceof Error ? error.message : 'Trial access is unavailable. Please sign in again.');
          } else update(local.allowed, local.allowed ? undefined : local.error || 'Connect to the internet to verify trial access.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to verify trial access';
        if (message.includes('No handler registered') && !browserTrial(useAuthStore.getState().token).is_trial) update(true);
        else update(false, message);
      }
      finally { running = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 60000);
    const onFocus = () => void check();
    window.addEventListener('online', onFocus);
    window.addEventListener('focus', onFocus);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('online', onFocus); window.removeEventListener('focus', onFocus); };
  }, [tenantId, userId, authenticated, attempt]);
  const current = result?.tenantId === tenantId && result?.userId === userId;
  return { checking: authenticated && !current,
    blocked: authenticated && current && !result!.allowed,
    error: result?.error, retry: () => setAttempt(value => value + 1) };
}
