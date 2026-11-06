import { storeTime } from '../../../utils/time/dateDisplay';
import { CircleCheck, Clock, ShoppingBag, Bike, LayoutGrid, ChefHat, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { RedCrossButton } from '../../ui/RedCrossButton';
import { formatCurrency } from '../../../utils/pricing/money';

export type RestaurantView = 'floor' | 'tokens' | 'kitchen';

interface TopBarProps {
  title: string;
  view: RestaurantView;
  onClose: () => void;
  subtitle?: string;
  stats: { freeTables: number; totalTables: number; openOrders: number; ready: number; openValue: number };
  onManage?: () => void;
  onNewTakeaway?: () => void;
  onNewDelivery?: () => void;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/** Standard two-row application header: page actions above a compact operational summary. */
export function RestaurantTopBar({ title, view, onClose, subtitle, stats, onNewTakeaway, onNewDelivery, onManage }: TopBarProps) {
  const now = useClock();
  const Icon = view === 'floor' ? LayoutGrid : view === 'tokens' ? ShoppingBag : ChefHat;
  const stat = (label: string, value: string) => (
    <div className="flex items-center gap-2 whitespace-nowrap text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums text-foreground">{value}</span>
    </div>
  );
  return (
    <header className="shrink-0 z-30 border-b border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary shadow-inner"><Icon className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-foreground">{title}</h1>
            <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">{subtitle || 'Live orders and kitchen progress'}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onManage && <Button variant="outline" onClick={onManage}>{view === 'floor' ? 'Add / Edit Tables' : 'Manage Stations'}</Button>}
          {onNewTakeaway && <Button onClick={onNewTakeaway}><ShoppingBag className="mr-1.5 h-3.5 w-3.5" />Takeaway</Button>}
          {onNewDelivery && <Button variant="outline" onClick={onNewDelivery}><Bike className="mr-1.5 h-3.5 w-3.5" />Delivery</Button>}
          <RedCrossButton onClick={onClose} title="Back to Dashboard" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/50 bg-background/50 px-4 py-3 sm:px-6">
        {view === 'floor' && stat('Tables free', `${stats.freeTables} / ${stats.totalTables}`)}
        {stat('Open orders', String(stats.openOrders))}
        {stat('Ready to serve', String(stats.ready))}
        {stat('Running value', formatCurrency(stats.openValue))}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Clock className="h-3 w-3" />{storeTime(now, undefined, { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </header>
  );
}

interface ToastProps {
  message: { tone: 'ok' | 'error' | 'warn'; text: string } | null;
  onClose: () => void;
}

/** Floating status message (bottom right); success messages fade by themselves. */
export function RestaurantToast({ message, onClose }: ToastProps) {
  useEffect(() => {
    if (message?.tone !== 'ok') return;
    const t = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  const tone = message.tone === 'error' ? 'border-rose-500/40 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
    : message.tone === 'warn' ? 'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
      : 'border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
  return (
    <div role="status" className={`fixed bottom-5 right-5 z-[60] flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl ${tone}`}>
      {message.tone === 'ok' && <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="flex-1">{message.text}</span>
      <button type="button" onClick={onClose} title="Dismiss" className="opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
    </div>
  );
}
