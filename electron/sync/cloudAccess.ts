import { BrowserWindow } from 'electron';
import { getDb } from '../db/localDb.js';
import { syncState } from './syncState.js';
import { getAuthConfig } from './syncConfig.js';
import { getTotalPendingRecords } from './syncProgress.js';
import { drainPendingCloudQueue } from './syncWorker.js';
import * as cloudAccessSql from '../db/statements/sync/cloudAccess.js';

/** Cloud access rules for this terminal: the super-admin cloud access config, schedule windows and the effective allowed state. */
export interface CloudScheduleWindow {
  id: string;
  startTime: string; // "HH:MM" e.g. "09:00"
  endTime: string;   // "HH:MM" e.g. "17:00"
  daysOfWeek?: number[]; // [0..6] (0 = Sunday) or undefined/empty = all days
  enabled: boolean;
}

export interface CloudAccessConfig {
  cloud_access_enabled: boolean;
  cloud_schedule_enabled: boolean;
  cloud_schedules: CloudScheduleWindow[];
  cloud_manual_override: 'AUTO' | 'FORCE_ON' | 'FORCE_OFF';
}

export interface EffectiveCloudState {
  isCloudAllowed: boolean;
  stateName: 'LOCAL_ONLY' | 'LOCAL_PLUS_CLOUD' | 'LOCAL_WITH_PENDING_CLOUD_QUEUE';
  activeReason: string;
  pendingCount: number;
  config: CloudAccessConfig;
}

export function getCloudAccessConfig(tenantId?: string): CloudAccessConfig {
  try {
    const db = getDb();
    const tid = tenantId || getAuthConfig()?.tenant_id || 'global';
    const row = cloudAccessSql.selectSettings(db).get(tid) as { value: string } | undefined;
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      return {
        cloud_access_enabled: parsed.cloud_access_enabled !== false,
        cloud_schedule_enabled: !!parsed.cloud_schedule_enabled,
        cloud_schedules: Array.isArray(parsed.cloud_schedules) ? parsed.cloud_schedules : [],
        cloud_manual_override: parsed.cloud_manual_override || 'AUTO',
      };
    }
  } catch { /* ignore */ }
  return {
    cloud_access_enabled: true,
    cloud_schedule_enabled: false,
    cloud_schedules: [],
    cloud_manual_override: 'AUTO',
  };
}

export function updateCloudAccessConfig(configUpdate: Partial<CloudAccessConfig>, tenantId?: string): CloudAccessConfig {
  const db = getDb();
  const tid = tenantId || getAuthConfig()?.tenant_id || 'global';
  const existing = getCloudAccessConfig(tid);
  const updated: CloudAccessConfig = {
    cloud_access_enabled: configUpdate.cloud_access_enabled !== undefined ? configUpdate.cloud_access_enabled : existing.cloud_access_enabled,
    cloud_schedule_enabled: configUpdate.cloud_schedule_enabled !== undefined ? configUpdate.cloud_schedule_enabled : existing.cloud_schedule_enabled,
    cloud_schedules: Array.isArray(configUpdate.cloud_schedules) ? configUpdate.cloud_schedules.slice(0, 24) : existing.cloud_schedules,
    cloud_manual_override: configUpdate.cloud_manual_override || existing.cloud_manual_override,
  };

  try {
    cloudAccessSql.insertSettings(db).run(tid, JSON.stringify(updated));
    console.log(`[SyncWorker] Updated cloud_access_config for tenant ${tid}:`, updated);
  } catch (err) {
    console.error('[SyncWorker] Error updating cloud_access_config:', (err as Error).message);
  }

  const effective = calculateEffectiveCloudAccess(tid);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('sync:cloud-state-changed', effective);
  }
  return updated;
}

export function calculateEffectiveCloudAccess(tenantId?: string): EffectiveCloudState {
  const db = getDb();
  const tid = tenantId || getAuthConfig()?.tenant_id || 'global';
  const config = getCloudAccessConfig(tid);
  const pendingCount = tid ? getTotalPendingRecords(db, tid) : 0;

  let isCloudAllowed = true;
  let activeReason = 'Cloud access enabled by Super Admin';

  if (!config.cloud_access_enabled) {
    isCloudAllowed = false;
    activeReason = 'Cloud access disabled by Super Admin';
  } else if (config.cloud_manual_override === 'FORCE_OFF') {
    isCloudAllowed = false;
    activeReason = 'Cloud access manually overridden to OFF';
  } else if (config.cloud_manual_override === 'FORCE_ON') {
    isCloudAllowed = true;
    activeReason = 'Cloud access manually overridden to ON';
  } else if (config.cloud_schedule_enabled && config.cloud_schedules.length > 0) {
    const now = new Date();
    const currentDay = now.getDay(); // 0..6
    const pad = (n: number) => String(n).padStart(2, '0');
    const currentHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let matchedWindow: CloudScheduleWindow | null = null;

    for (const win of config.cloud_schedules) {
      if (!win.enabled) continue;
      if (win.daysOfWeek && win.daysOfWeek.length > 0 && !win.daysOfWeek.includes(currentDay)) {
        continue;
      }
      const { startTime, endTime } = win;
      if (startTime <= endTime) {
        if (currentHHMM >= startTime && currentHHMM <= endTime) {
          matchedWindow = win;
          break;
        }
      } else {
        // Midnight crossing e.g. 22:00 to 04:00
        if (currentHHMM >= startTime || currentHHMM <= endTime) {
          matchedWindow = win;
          break;
        }
      }
    }

    if (matchedWindow) {
      isCloudAllowed = true;
      activeReason = `Active schedule window (${matchedWindow.startTime} - ${matchedWindow.endTime})`;
    } else {
      isCloudAllowed = false;
      activeReason = 'Outside scheduled Cloud access windows';
    }
  }

  // Detect state transition from OFF -> ON to auto-drain queue
  if (syncState.lastCloudAllowedState === false && isCloudAllowed === true) {
    console.log('[SyncWorker] ⚡ Cloud access re-enabled (OFF -> ON transition detected). Triggering background queue drain...');
    setTimeout(() => {
      drainPendingCloudQueue().catch(() => {});
    }, 1000);
  }
  syncState.lastCloudAllowedState = isCloudAllowed;

  let stateName: 'LOCAL_ONLY' | 'LOCAL_PLUS_CLOUD' | 'LOCAL_WITH_PENDING_CLOUD_QUEUE';
  if (!isCloudAllowed) {
    stateName = pendingCount > 0 ? 'LOCAL_WITH_PENDING_CLOUD_QUEUE' : 'LOCAL_ONLY';
  } else {
    stateName = 'LOCAL_PLUS_CLOUD';
  }

  return {
    isCloudAllowed,
    stateName,
    activeReason,
    pendingCount,
    config,
  };
}
