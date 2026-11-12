import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Bell, BellOff, CheckCheck, Circle, Download, PackageX, RefreshCw, Search, TriangleAlert, CloudOff, type LucideIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { RedCrossButton } from '../ui/RedCrossButton';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { useNotifications } from './hooks/useNotifications';
import {
  filterNotifications, type AppNotification, type NotificationKind, type NotificationStatusFilter,
} from '../../utils/notifications/notifications';

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  OUT_OF_STOCK: PackageX,
  LOW_STOCK: TriangleAlert,
  UPDATE_AVAILABLE: Download,
  SYNC_PAUSED: CloudOff,
};

const SEVERITY_STYLE: Record<AppNotification['severity'], string> = {
  critical: 'text-red-500 bg-red-500/10',
  warning: 'text-amber-500 bg-amber-500/10',
  info: 'text-blue-500 bg-blue-500/10',
};

const STATUS_FILTERS: { key: NotificationStatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'UNREAD', label: 'Unread' },
  { key: 'READ', label: 'Read' },
];

export interface NotificationsPageProps {
  onClose: () => void;
}

/** Notifications page: list of shop alerts with search, read/unread filter, and mark-as-read actions. */
export function NotificationsPage({ onClose }: NotificationsPageProps) {
  useCloseOnEscape(onClose);
  const { notifications, unreadCount, isLoading, error, reload, markRead, markUnread, markAllRead } = useNotifications();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<NotificationStatusFilter>('ALL');
  const visible = useMemo(() => filterNotifications(notifications, query, status), [notifications, query, status]);

  const openTarget = (n: AppNotification) => {
    markRead(n.id);
    if (n.actionEvent) {
      onClose();
      window.dispatchEvent(new CustomEvent(n.actionEvent));
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <header className="shrink-0 border-b border-border bg-card shadow-xs">
        <div className="flex items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bell className="h-4.5 w-4.5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">Notifications</h1>
              <p className="text-[11px] text-muted-foreground">
                {unreadCount === 0 ? 'You are all caught up' : `${unreadCount} unread`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={isLoading} title="Refresh notifications">
              <RefreshCw className={clsx('mr-1.5 h-3.5 w-3.5', isLoading && 'animate-spin')} /> Refresh
            </Button>
            <Button size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark all as read
            </Button>
            <div className="h-6 w-px bg-border/80 mx-1" />
            <RedCrossButton onClick={onClose} title="Close" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 pb-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search notifications..."
              aria-label="Search notifications"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/60 p-1" role="tablist" aria-label="Filter by status">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={status === f.key}
                onClick={() => setStatus(f.key)}
                className={clsx('cursor-pointer rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all',
                  status === f.key ? 'border border-border bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-4 bg-card">
        {error && (
          <div className="mb-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</div>
        )}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <BellOff className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm font-semibold">{query || status !== 'ALL' ? 'No notifications match your search' : 'No notifications'}</p>
          </div>
        ) : (
          <ul className="flex w-full flex-col gap-2.5" aria-label="Notifications">
            {visible.map(n => {
              const Icon = KIND_ICON[n.kind];
              return (
                <li
                  key={n.id}
                  data-testid="notification-item"
                  data-read={n.read ? 'true' : 'false'}
                  className={clsx(
                    'flex w-full items-start gap-3.5 rounded-xl border p-4 transition-all',
                    n.read
                      ? 'border-border/60 bg-muted/15 text-muted-foreground hover:bg-muted/25'
                      : 'border-border bg-card hover:bg-muted/20 hover:border-primary/40 shadow-xs'
                  )}
                >
                  <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', SEVERITY_STYLE[n.severity])}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => openTarget(n)}>
                    <div className="flex items-center gap-2">
                      {!n.read && <Circle className="h-2 w-2 shrink-0 fill-primary text-primary" aria-label="Unread" />}
                      <p className={clsx('truncate text-xs', n.read ? 'font-medium text-muted-foreground' : 'font-bold text-foreground')}>{n.title}</p>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{n.message}</p>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => (n.read ? markUnread(n.id) : markRead(n.id))}
                    aria-label={n.read ? `Mark "${n.title}" as unread` : `Mark "${n.title}" as read`}
                  >
                    {n.read ? 'Mark unread' : 'Mark as read'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
