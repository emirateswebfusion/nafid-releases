import { useEffect, useMemo } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useNotificationStore } from '../../../store/notificationStore';
import { useUpdateStore } from '../../../store/updateStore';
import {
  applyReadState, buildSyncPausedNotification, buildUpdateNotification, countUnread,
  type AppNotification,
} from '../../../utils/notifications/notifications';

export interface UseNotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
}

/** All notifications for the signed-in user (stock alerts, update available, cloud sync paused) with read state.
 * Loads stock alerts on mount and whenever the shop or user changes. */
export function useNotifications(): UseNotificationsResult {
  const tenantId = useAuthStore(s => s.tenantId);
  const userId = useAuthStore(s => s.userId);
  const isCloudSyncPaused = useAuthStore(s => s.isCloudSyncPaused);
  const cloudSyncReason = useAuthStore(s => s.cloudSyncReason);
  const updateVersion = useUpdateStore(s => s.updateInfo?.version ?? null);
  const { stockNotifications, readIds, isLoading, error, load, markRead, markUnread, markAllRead } = useNotificationStore();

  useEffect(() => {
    void load(tenantId || 'global', userId);
  }, [load, tenantId, userId]);

  const notifications = useMemo(() => {
    const items = [
      buildSyncPausedNotification(isCloudSyncPaused, cloudSyncReason),
      buildUpdateNotification(updateVersion),
      ...stockNotifications,
    ].filter((n): n is Omit<AppNotification, 'read'> => n !== null);
    return applyReadState(items, readIds);
  }, [cloudSyncReason, isCloudSyncPaused, readIds, stockNotifications, updateVersion]);

  return {
    notifications,
    unreadCount: countUnread(notifications),
    isLoading,
    error,
    reload: () => { void load(tenantId || 'global', userId); },
    markRead: (id) => { void markRead(id); },
    markUnread: (id) => { void markUnread(id); },
    markAllRead: () => { void markAllRead(notifications.filter(n => !n.read).map(n => n.id)); },
  };
}
