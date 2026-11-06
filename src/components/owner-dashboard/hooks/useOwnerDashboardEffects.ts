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
  const { setDisplayTime, setEnableScrap, setInvoiceCount, setMenuOpen, setSyncMode, setTotalSales, setTotalSalesBeforeDeductions, setDashboardSalesMetric } = ctx.od;
  useEffect(() => {
    loadCardOrder(tenantId, userId, role);
  }, [tenantId, userId, role, loadCardOrder]);

  useEffect(() => {
    if (!isDesktopRuntime() || !tenantId) return;
    settingsApi.get({ tenant_id: tenantId || 'global', key: 'network_sync_config' }).then((cfg: { syncMode?: 'CLOUD' | 'LAN' | 'HYBRID' } | null) => {
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
      setTotalSalesBeforeDeductions(result.totalSalesBeforeDeductions ?? result.totalSales ?? 0);
      setInvoiceCount(result.invoiceCount ?? 0);
    }
  }, [tenantId, setInvoiceCount, setTotalSales, setTotalSalesBeforeDeductions]);

  const loadSalesMetric = useCallback(async () => {
    if (!isDesktopRuntime() || !tenantId) return;
    try {
      const metric = await settingsApi.get({ tenant_id: tenantId || 'global', key: 'dashboard_sales_metric' });
      if (metric === 'NET_REVENUE' || metric === 'GROSS_SALES') {
        setDashboardSalesMetric(metric);
      }
    } catch { /* ignore */ }
  }, [tenantId, setDashboardSalesMetric]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadSalesMetric();
  }, [loadSalesMetric]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      loadSalesMetric();
      loadStats();
    };
    window.addEventListener('settings:updated', handleSettingsUpdated);
    return () => window.removeEventListener('settings:updated', handleSettingsUpdated);
  }, [loadSalesMetric, loadStats]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    settingsApi.get({ tenant_id: tenantId || 'global', key: 'enable_scrap' }).then((v: unknown) => {
      if (v !== null && v !== undefined) setEnableScrap(Boolean(v));
    });
  }, [tenantId, setEnableScrap]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;

    const subscriptions: (() => void)[] = [];
    if (hasBridge('onSyncCycleComplete')) {
      subscriptions.push(bridgeEvents.onSyncCycleComplete(() => {
        const t = Date.now();
        setLastSyncTime(t);
        setDisplayTime('just now');
        loadStats();
      }));
    }

    if (hasBridge('onSyncDataUpdated')) {
      subscriptions.push(bridgeEvents.onSyncDataUpdated(() => {
        loadStats();
      }));
    }

    const interval = setInterval(() => {
      loadStats();
    }, 30000);

    return () => { clearInterval(interval); subscriptions.forEach(unsubscribe => unsubscribe()); };
  }, [setLastSyncTime, loadStats, setDisplayTime]);


  useEffect(() => {
    if (!lastSyncTime) return;
    const interval = setInterval(() => {
      setDisplayTime(timeAgo(lastSyncTime));
    }, 10000);
    return () => clearInterval(interval);
  }, [lastSyncTime, setDisplayTime]);
}
