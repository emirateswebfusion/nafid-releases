// @vitest-environment jsdom
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '../../src/store/authStore';
import { DashboardHeader } from '../../src/components/owner-dashboard/views/DashboardHeader';
import { useOwnerDashboardState } from '../../src/components/owner-dashboard/hooks/useOwnerDashboardState';
import { CashierHeader } from '../../src/components/cashier/views/CashierHeader';
import { QuickPinLogin } from '../../src/components/auth/QuickPinLogin';
import { LoginScreen } from '../../src/components/auth/LoginScreen';
import { DigitalClock } from '../../src/components/owner-dashboard/DigitalClock';
import { PinCloudBanner } from '../../src/components/ui/PinCloudBanner';
import { cloudFetch, PinCloudAuthError, PIN_CLOUD_AUTH_MESSAGE } from '../../src/data/cloud/client';

const state = vi.hoisted(() => ({
  directory: '',
  encryptionAvailable: true,
  lockSession: vi.fn(async () => ({ success: true, cloud_sync_ready: true })),
  isLocked: vi.fn(async () => false),
  getLockMode: vi.fn(async () => 'pin' as const),
  checkUserPin: vi.fn(async () => ({ has_pin: true })),
  loginWithPin: vi.fn(),
  getToken: vi.fn(),
  getOfflineSession: vi.fn(),
  getTerminalConfig: vi.fn(async () => ({ isConfigured: false })),
}));

vi.mock('electron', () => ({
  app: { getPath: () => state.directory },
  safeStorage: {
    isEncryptionAvailable: () => state.encryptionAvailable,
    encryptString: (text: string) => Buffer.from(`enc:${text}`, 'utf8'),
    decryptString: (buf: Buffer) => {
      const str = buf.toString('utf8');
      if (!str.startsWith('enc:')) throw new Error('bad');
      return str.slice(4);
    },
  },
}));

vi.mock('../../src/data/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/client')>()),
  isDesktopRuntime: () => true,
  hasBridge: () => true,
}));

vi.mock('../../src/data/auth', () => ({
  authApi: {
    lockSession: state.lockSession,
    isLocked: state.isLocked,
    getLockMode: state.getLockMode,
    checkUserPin: state.checkUserPin,
    loginWithPin: state.loginWithPin,
    getToken: state.getToken,
    getOfflineSession: state.getOfflineSession,
    getTerminalConfig: state.getTerminalConfig,
    clearToken: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock('../../src/data/events', () => ({
  bridgeEvents: {
    onDeepLink: vi.fn(() => () => {}),
    onSyncCycleComplete: vi.fn(() => () => {}),
    onSyncDataUpdated: vi.fn(() => () => {}),
    onOnlineStatus: vi.fn(() => () => {}),
  },
}));

vi.mock('../../src/store/updateStore', () => ({ useUpdateStore: () => ({ init: vi.fn() }) }));
vi.mock('../../src/data/settings', () => ({ settingsApi: { get: async () => null } }));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  state.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nafid-lock-sec-'));
  state.encryptionAvailable = true;
  state.lockSession.mockResolvedValue({ success: true, cloud_sync_ready: true });
  state.isLocked.mockResolvedValue(false);
  state.getLockMode.mockResolvedValue('pin');
  state.checkUserPin.mockResolvedValue({ has_pin: true });
  state.getOfflineSession.mockResolvedValue(null);
  state.getTerminalConfig.mockResolvedValue({ isConfigured: false });
  state.getToken.mockResolvedValue(null);
  useAuthStore.setState({
    isAuthenticated: true,
    token: null,
    tenantId: 'shop',
    userId: 'cashier',
    role: 'STAFF',
    permissions: ['sales.create'],
    userName: 'Cashier',
    shopName: 'Shop',
    isCloudSyncPaused: false,
    cloudSyncReason: null,
  });
});

afterEach(() => {
  cleanup();
  fs.rmSync(state.directory, { recursive: true, force: true });
});

describe('Lock / Switch User & Encrypted Auth Storage', () => {
  it('omits and deletes plaintext config.json when OS safeStorage encryption is available', async () => {
    const { writeAuthPayload, readAuthPayload } = await import('../../electron/services/authStorage');
    const configPath = path.join(state.directory, 'config.json');
    const encPath = path.join(state.directory, 'auth.enc');

    fs.writeFileSync(configPath, JSON.stringify({ jwt_token: 'legacy-plain' }));
    const ok = writeAuthPayload(JSON.stringify({ tenant_id: 'shop', jwt_token: 'secret-jwt' }));

    expect(ok).toBe(true);
    expect(fs.existsSync(configPath)).toBe(false);
    expect(fs.existsSync(encPath)).toBe(true);
    expect(readAuthPayload()).toEqual({ tenant_id: 'shop', jwt_token: 'secret-jwt' });
  });

  it('locks the terminal session and blocks startup auto-login while locked', async () => {
    await useAuthStore.getState().lockTerminal();
    expect(state.lockSession).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    state.isLocked.mockResolvedValue(true);
    state.getToken.mockResolvedValue({ tenant_id: 'shop', user_id: 'owner', role: 'ADMIN', jwt_token: 'valid' });
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('offers Lock Terminal in DashboardHeader menu', async () => {
    function Harness() {
      const od = useOwnerDashboardState();
      return (
        <DashboardHeader
          canOpenSettings={false}
          isCloudSyncPaused={false}
          isEditMode={false}
          isSyncing={false}
          menuRef={{ current: null }}
          role="ADMIN"
          setIsEditMode={() => {}}
          shopName="Shop"
          theme="light"
          toggleTheme={() => {}}
          userName="Owner"
          od={od}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByTitle('Profile'));
    fireEvent.click(await screen.findByText('Lock Terminal'));
    await waitFor(() => expect(state.lockSession).toHaveBeenCalledOnce());
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('shows Re-Login Needed in CashierHeader when cloud sync is paused', () => {
    useAuthStore.setState({ isCloudSyncPaused: true });
    const open = vi.fn();
    window.addEventListener('open-session-expired-modal', open);
    try {
      render(
        <CashierHeader
          closeResult={null}
          drawer={null}
          drawerClosed={false}
          drawerOpen={true}
          handleOpenOpeningBalModal={async () => {}}
          isRestricted={true}
          lastSyncTime={null}
          load={async () => {}}
          onClose={() => {}}
          openHistory={async () => {}}
          pageTitle="Cash Register"
          setActualCash={() => {}}
          setCloseResult={() => {}}
          setShowDayClose={() => {}}
          showSettlement={false}
          yesterdayNotClosed={false}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /Re-Login Needed/i }));
      expect(open).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('open-session-expired-modal', open);
    }
  });

  it('displays offline PIN notice when cloudSyncReady is false and honors initial lockout timer', () => {
    render(
      <QuickPinLogin
        shopName="Shop"
        userName="Cashier"
        role="STAFF"
        cloudSyncReady={false}
        initialLockoutSeconds={18}
        onSwitchToEmail={() => {}}
      />
    );
    expect(screen.getByText(/Offline PIN only/i)).toBeTruthy();
    expect(screen.getByText(/Locked for 18s/i)).toBeTruthy();
  });

  it('turns 401 on direct cloudFetch during a PIN session into PinCloudAuthError instead of raw header error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ error: 'Missing or malformed Authorization header' }), { status: 401 })
    );
    try {
      useAuthStore.setState({ isAuthenticated: true, token: null, tenantId: 'shop-1', userId: 'cashier-1', role: 'STAFF' });
      await expect(cloudFetch('/api/einvoice/overview')).rejects.toBeInstanceOf(PinCloudAuthError);
      await expect(cloudFetch('/api/einvoice/overview')).rejects.toThrow(PIN_CLOUD_AUTH_MESSAGE);
      expect(fetchSpy).toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('does not show PIN header/dropdown buttons, keeps PinCloudBanner hidden for same-user PIN unlock, and shows banner + email transition for switched PIN user', async () => {
    const validJwt = `h.${btoa(JSON.stringify({ exp: 4102444800, role: 'ADMIN' }))}.s`;
    state.getToken.mockResolvedValue({ jwt_token: validJwt, tenant_id: 'shop-1', user_id: 'owner-1', role: 'ADMIN' });

    // 1. Same user (owner-1) signs back in via PIN -> cloud token is restored immediately, no warning banner.
    state.loginWithPin.mockResolvedValueOnce({
      success: true,
      cloud_sync_ready: true,
      user: { tenant_id: 'shop-1', user_id: 'owner-1', name: 'Owner', role: 'ADMIN', permissions: ['*'] },
    });
    await useAuthStore.getState().loginWithPin('1234');
    expect(useAuthStore.getState().token).toBe(validJwt);

    const { rerender } = render(<PinCloudBanner feature="UAE e-invoice cloud settings" />);
    expect(screen.queryByRole('status')).toBeNull();

    // 2. Different staff member (staff-2) switches in via PIN -> token stays null, banner renders, header stays clean.
    state.loginWithPin.mockResolvedValueOnce({
      success: true,
      cloud_sync_ready: true,
      user: { tenant_id: 'shop-1', user_id: 'staff-2', name: 'Manager B', role: 'ADMIN', permissions: ['*'] },
    });
    await useAuthStore.getState().loginWithPin('5678');
    expect(useAuthStore.getState().token).toBeNull();

    function Wrapper() {
      const od = useOwnerDashboardState();
      return (
        <div>
          <DashboardHeader
            canOpenSettings={false}
            isCloudSyncPaused={false}
            isEditMode={false}
            isSyncing={false}
            menuRef={{ current: null }}
            role="ADMIN"
            setIsEditMode={() => {}}
            shopName="Shop"
            theme="light"
            toggleTheme={() => {}}
            userName="Manager B"
            od={{ ...od, activeRoute: 'CLOUD', isOnline: true, menuOpen: true }}
          />
          <PinCloudBanner feature="UAE e-invoice cloud settings" />
        </div>
      );
    }

    rerender(<Wrapper />);
    expect(screen.getByRole('button', { name: 'Cloud Connected' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /PIN Session/i })).toBeNull();
    expect(screen.queryByText(/Full Email Sign-In/i)).toBeNull();
    expect(screen.queryByText(/Email login needed for cloud tools/i)).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('UAE e-invoice cloud settings requires an Email & Password sign-in');

    fireEvent.click(screen.getByRole('button', { name: /Sign in with Email/i }));
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));

    state.getTerminalConfig.mockResolvedValueOnce({ isConfigured: true, tenant_id: 'shop-1', shop_name: 'Shop', user_name: 'Manager B', role: 'ADMIN', cloud_sync_ready: true, is_locked: false } as never);
    render(<LoginScreen />);
    await waitFor(() => expect(state.getTerminalConfig).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('you@yourshop.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('Your password')).toBeTruthy();
    sessionStorage.removeItem('auth_prefer_email');
  });

  it('redirects logout to Email login by default and lockTerminal to Terminal Locked screen by default', async () => {
    const cfg = { isConfigured: true, tenant_id: 'shop-1', shop_name: 'Shop', user_name: 'Owner', role: 'ADMIN', cloud_sync_ready: false, is_locked: true };

    // 1. Full logout -> Email & Password screen by default
    useAuthStore.setState({ isAuthenticated: true, token: 'jwt', tenantId: 'shop-1', userId: 'owner-1', role: 'ADMIN' });
    await useAuthStore.getState().logout();
    expect(sessionStorage.getItem('auth_prefer_email')).toBe('1');

    state.getTerminalConfig.mockResolvedValueOnce({ ...cfg, is_locked: false } as never);
    const { unmount } = render(<LoginScreen />);
    await waitFor(() => expect(state.getTerminalConfig).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText('you@yourshop.com')).toBeTruthy();
    unmount();

    // 2. Lock terminal -> clears email preference and opens Locked Terminal PIN screen by default
    useAuthStore.setState({ isAuthenticated: true, token: 'jwt', tenantId: 'shop-1', userId: 'owner-1', role: 'ADMIN' });
    await useAuthStore.getState().lockTerminal();
    expect(sessionStorage.getItem('auth_prefer_email')).toBeNull();

    state.getTerminalConfig.mockResolvedValueOnce(cfg as never);
    render(<LoginScreen />);
    await waitFor(() => expect(screen.getByText('Terminal Locked')).toBeTruthy());
    expect(screen.getByText(/Log out to switch account/i)).toBeTruthy();
  });

  it('prompts to configure PIN when lockTerminal is invoked by a user without a PIN', async () => {
    // Logged in user without PIN configured
    state.checkUserPin.mockResolvedValueOnce({ has_pin: false });
    useAuthStore.setState({
      isAuthenticated: true,
      token: 'jwt',
      tenantId: 'shop-1',
      userId: 'owner-no-pin',
      userEmail: 'owner@shop.com',
      role: 'ADMIN',
    });

    await useAuthStore.getState().lockTerminal();
    expect(state.checkUserPin).toHaveBeenCalledWith({
      tenant_id: 'shop-1',
      user_id: 'owner-no-pin',
      email: 'owner@shop.com',
    });
    expect(state.lockSession).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().authError).toContain('No PIN configured');
  });

  it('logs out and redirects to email login when clicking Log out to switch account on the lock screen', async () => {
    useAuthStore.setState({ isAuthenticated: true, token: 'jwt', tenantId: 'shop-1', userId: 'owner-1', role: 'ADMIN' });
    render(
      <QuickPinLogin
        shopName="Shop"
        userName="Owner"
        role="ADMIN"
        cloudSyncReady={true}
        onSwitchToEmail={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Log out to switch account/i));
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
  });

  it('locks the terminal from the footer lock icon next to the FY selector', async () => {
    useAuthStore.setState({ isAuthenticated: true, token: 'jwt', tenantId: 'shop-1', userId: 'owner-1', role: 'ADMIN' });
    render(<DigitalClock variant="footer" />);
    fireEvent.click(screen.getByRole('button', { name: 'Lock terminal' }));
    await waitFor(() => expect(state.lockSession).toHaveBeenCalledOnce());
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(sessionStorage.getItem('auth_prefer_email')).toBeNull();
  });
});
