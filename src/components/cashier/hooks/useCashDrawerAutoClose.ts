import { useCallback, useEffect, useRef, useState } from 'react';
import { cashierApi } from '../../../data/cashier';
import { hasBridge, isDesktopRuntime } from '../../../data/client';
import { useAuthStore } from '../../../store/authStore';

const COUNTDOWN_SECONDS = 300;
const IDLE_MS = 10 * 60 * 1000;
const POLL_MS = 60 * 1000;

export interface CashDrawerAutoCloseDialog {
  drawerId: string;
  businessDate: string;
  dueAt: string;
}

export function useCashDrawerAutoClose() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tenantId = useAuthStore((s) => s.tenantId);
  const userId = useAuthStore((s) => s.userId);
  const userName = useAuthStore((s) => s.userName);

  const [dialog, setDialog] = useState<CashDrawerAutoCloseDialog | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [toast, setToast] = useState<string | null>(null);

  const lastActivityRef = useRef(0);
  const handledRef = useRef<string | null>(null);
  const dialogRef = useRef<CashDrawerAutoCloseDialog | null>(null);
  const closingRef = useRef(false);

  const closeDrawer = useCallback(async (current: CashDrawerAutoCloseDialog) => {
    if (closingRef.current) return;
    closingRef.current = true;
    const key = `${current.drawerId}:${current.dueAt}`;
    handledRef.current = key;
    dialogRef.current = null;
    setDialog(null);
    try {
      const result = await cashierApi.autoCloseNow({
        tenant_id: tenantId || 'global',
        drawer_id: current.drawerId,
        user_id: userId ?? undefined,
        user_name: userName ?? undefined,
      });
      if (!result || !result.error) {
        setToast(`Cash drawer of ${current.businessDate} was closed automatically`);
      }
    } finally {
      closingRef.current = false;
    }
  }, [tenantId, userId, userName]);

  const refresh = useCallback(async () => {
    if (!isDesktopRuntime() || !hasBridge('dbCashierGetAutoCloseStatus')) return;
    if (!isAuthenticated || !tenantId) return;
    const status = await cashierApi.getAutoCloseStatus({ tenant_id: tenantId });
    if (!status || 'error' in status) return;
    if (!status.enabled || !status.is_due || !status.drawer_id || !status.due_at) return;

    const current: CashDrawerAutoCloseDialog = {
      drawerId: status.drawer_id,
      businessDate: status.business_date || '',
      dueAt: status.due_at,
    };
    const key = `${current.drawerId}:${current.dueAt}`;
    if (handledRef.current === key) return;
    if (dialogRef.current?.drawerId === current.drawerId && dialogRef.current?.dueAt === current.dueAt) return;

    handledRef.current = key;
    if (Date.now() - lastActivityRef.current >= IDLE_MS) {
      await closeDrawer(current);
      return;
    }

    dialogRef.current = current;
    setDialog(current);
    setSecondsLeft(COUNTDOWN_SECONDS);
  }, [isAuthenticated, tenantId, closeDrawer]);

  const closeNow = useCallback(() => {
    const current = dialogRef.current;
    if (current) void closeDrawer(current);
  }, [closeDrawer]);

  const snooze = useCallback(async (minutes: number) => {
    const current = dialogRef.current;
    if (!current) return;
    handledRef.current = `${current.drawerId}:${current.dueAt}`;
    dialogRef.current = null;
    setDialog(null);
    await cashierApi.snoozeAutoClose({
      tenant_id: tenantId || 'global',
      drawer_id: current.drawerId,
      minutes,
    });
    await refresh();
  }, [tenantId, refresh]);

  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, tenantId, refresh]);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    const markActivity = () => { lastActivityRef.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'] as const;
    events.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, markActivity));
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [dialog]);

  useEffect(() => {
    if (dialog && secondsLeft === 0) {
      void closeDrawer(dialog);
    }
  }, [dialog, secondsLeft, closeDrawer]);

  return { dialog, secondsLeft, toast, clearToast, closeNow, snooze };
}
