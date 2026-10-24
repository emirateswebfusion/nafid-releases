import React, { useEffect, useCallback } from 'react';
import { isDesktopRuntime, hasBridge } from '../../../data/client';
import { settingsApi } from '../../../data/settings';
import { invoicesApi } from '../../../data/invoices';
import { bridgeEvents } from '../../../data/events';
import { timeAgo } from '../ownerDashboardTypes';
import type { OwnerDashboardState } from './useOwnerDashboardState';

export interface UseOwnerDashboardEffectsContext {
  lastSyncTime: number | null;
  loadCardOrder: (tenantId?: string | null, userId?: string | null, role?: string | null) => Promise<string[]>;
  loadFlags: (tenantId: string) => Promise<void>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  role: "SUPER_ADMIN" | "ADMIN" | "STAFF" | null;
  setLastSyncTime: (time: number) => void;
  tenantId: string | null;
  userId: string | null;
  od: OwnerDashboardState;
}

export function useOwnerDashboardEffects(ctx: UseOwnerDashboardEffectsContext) {
  const { lastSyncTime, loadCardOrder, loadFlags, menuRef, role, setLastSyncTime, tenantId, userId } = ctx;
  const { setActiveRoute, setDisplayTime, setEnableScrap, setInvoiceCount, setIsOnline, setMenuOpen, setSyncMode, setTotalSales } = ctx.od;
  useEffect(() => {
    loadCardOrder(tenantId, userId, role);
  }, [tenantId, userId, role, loadCardOrder]);

  useEffect(() => {
    if (!isDesktopRuntime() || !tenantId) return;
    settingsApi.get({ tenant_id: tenantId || 'global', key: 'network_sync_config' }).then((cfg: any) => {
      if (cfg && cfg.syncMode) setSyncMode(cfg.syncMode);
    }).catch(() => {});
  }, [tenantId, setSyncMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuRef, setMenuOpen]);

  useEffect(() => {
    if (!isDesktopRuntime() || !tenantId) return;
    loadFlags(tenantId);
  }, [tenantId, loadFlags]);

  const loadStats = useCallback(async () => {
    if (!hasBridge('dbGetDashboardStats') || !tenantId) return;
    const result = await invoicesApi.getDashboardStats(tenantId);
    if (result.success) {
      setTotalSales(result.totalSales ?? 0);
      setInvoiceCount(result.invoiceCount ?? 0);
    }
  }, [tenantId, setInvoiceCount, setTotalSales]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    settingsApi.get({ tenant_id: tenantId || 'global', key: 'enable_scrap' }).then((v: any) => {
      if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
    });
  }, [tenantId, setEnableScrap]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;

    if (hasBridge('onSyncCycleComplete')) {
      bridgeEvents.onSyncCycleComplete(() => {
        const t = Date.now();
        setLastSyncTime(t);
        setDisplayTime('just now');
        loadStats();
      });
    }

    if (hasBridge('onSyncDataUpdated')) {
      bridgeEvents.onSyncDataUpdated(() => {
        loadStats();
      });
    }

    const interval = setInterval(() => {
      loadStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [setLastSyncTime, loadStats, setDisplayTime]);

  useEffect(() => {
    if (hasBridge('onOnlineStatus')) {
      bridgeEvents.onOnlineStatus((online: boolean, route?: 'LAN' | 'CLOUD' | 'NONE') => {
        setIsOnline(online);
        if (route) setActiveRoute(route);
      });
      return;
    }
    setIsOnline(navigator.onLine);
    const handler = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }, [setActiveRoute, setIsOnline]);

  useEffect(() => {
    if (!lastSyncTime) return;
    const interval = setInterval(() => {
      setDisplayTime(timeAgo(lastSyncTime));
    }, 10000);
    return () => clearInterval(interval);
  }, [lastSyncTime, setDisplayTime]);
}
