/** Isolated renderer acceptance fixture. No shop database, real account, hardware or external network. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { SessionExpiredModal } from '../../src/components/app/SessionExpiredModal';
import { useAuthStore } from '../../src/store/authStore';
import { useSyncStatus } from '../../src/components/app/hooks/useSyncStatus';
import { Button } from '../../src/components/ui/Button';
import { AuthErrorToast } from '../../src/components/app/AuthErrorToast';
import { DashboardHeader } from '../../src/components/owner-dashboard/views/DashboardHeader';
import { useOwnerDashboardState } from '../../src/components/owner-dashboard/hooks/useOwnerDashboardState';

let available = false;
let saved = false;
const onlineListeners = new Set<(online: boolean, route?: 'CLOUD' | 'NONE') => void>();
const token = `h.${btoa(JSON.stringify({ exp: 4102444800, tenant_id: 'fixture-shop', user_id: 'owner' }))}.s`;
Object.defineProperty(window, 'electronAPI', { configurable: true, value: new Proxy({}, {
  get: (_target, key: string) => {
    if (key === 'onOnlineStatus') return (callback: (online: boolean, route?: 'CLOUD' | 'NONE') => void) => { onlineListeners.add(callback); return () => onlineListeners.delete(callback); };
    if (key.startsWith('on')) return () => () => {};
    if (key === 'authLoginCloud') return async () => ({ success: true, status: available ? 200 : 503, data: cloudBody() });
    if (key === 'authResumeCloudSession') return async () => { saved = true; return { success: true }; };
    if (key === 'authGetToken') return async () => saved ? { jwt_token: token, tenant_id: 'fixture-shop', user_id: 'owner' } : null;
    return async () => ({ success: true });
  },
}) });
const cloudBody = () => available
  ? { token, tenant_id: 'fixture-shop', user_id: 'owner', role: 'ADMIN', permissions: ['*'], shop_name: 'Test shop' }
  : { error: 'Cloud unavailable in this test. Close and continue working offline.' };
window.fetch = async () => new Response(JSON.stringify(cloudBody()), { status: available ? 200 : 503 });
useAuthStore.setState({ isAuthenticated: true, isLoading: false, tenantId: 'fixture-shop', userId: 'cashier', userName: 'Test cashier', role: 'STAFF', permissions: ['sales.create'], token: null, isCloudSyncPaused: true });

function FixtureHeader() {
  const od = useOwnerDashboardState();
  const paused = useAuthStore(state => state.isCloudSyncPaused);
  return <DashboardHeader canOpenSettings={false} isCloudSyncPaused={paused} isEditMode={false} isSyncing={false} menuRef={{ current: null }} role="STAFF" setIsEditMode={() => {}} shopName="Test shop" theme="light" toggleTheme={() => {}} userName="Test cashier" od={od} />;
}
export function Fixture() {
  const [open, setOpen] = useState(false);
  const [dashboard, setDashboard] = useState(true);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('open-session-expired-modal', show);
    return () => window.removeEventListener('open-session-expired-modal', show);
  }, []);
  const paused = useAuthStore(state => state.isCloudSyncPaused);
  const name = useAuthStore(state => state.userName);
  useSyncStatus({ isAuthenticated: true, isCloudSyncPaused: true });
  return <>{dashboard ? <FixtureHeader /> : <h2 className="p-5">Sales History — synthetic navigation fixture</h2>}<main className="p-8 space-y-5">
    <h1 className="text-2xl font-bold">Cloud recovery — isolated test shop</h1>
    <p>Signed in locally: {name}</p><p>Open bill: TEST-001 — 2 items</p>
    <Button onClick={() => setOpen(true)}>{paused ? 'Re-Login Needed' : 'Cloud credentials restored'}</Button>
    <div className="flex gap-3"><Button variant="outline" onClick={() => { available = false; }}>Simulate unavailable cloud</Button><Button variant="outline" onClick={() => { available = true; }}>Simulate available cloud</Button></div>
    <div className="flex gap-3"><Button variant="outline" onClick={() => { useAuthStore.setState({ isCloudSyncPaused: false }); onlineListeners.forEach(callback => callback(true, 'CLOUD')); }}>Simulate cloud connection</Button><Button variant="outline" onClick={() => onlineListeners.forEach(callback => callback(false, 'NONE'))}>Simulate disconnection</Button><Button variant="outline" onClick={() => useAuthStore.setState({ authError: 'Test sign-out could not finish. Please try again.' })}>Simulate sign-out error</Button></div>
    <Button variant="outline" onClick={() => setDashboard(value => !value)}>{dashboard ? 'Open Sales History' : 'Back to Dashboard'}</Button>
    <SessionExpiredModal isOpen={open} onClose={() => setOpen(false)} />
    <AuthErrorToast />
  </main></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
