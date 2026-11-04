import { ArrowLeft, BarChart3, Bike, ChefHat, CircleCheck, Clock, LayoutGrid, Settings2, ShoppingBag, UtensilsCrossed, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCurrency } from '../../../utils/pricing/money';

export type RestaurantView = 'floor' | 'tokens' | 'kitchen' | 'reports' | 'setup';

const NAV: { key: RestaurantView; label: string; icon: typeof LayoutGrid }[] = [
  { key: 'floor', label: 'Tables', icon: LayoutGrid },
  { key: 'tokens', label: 'Takeaway & Delivery', icon: ShoppingBag },
  { key: 'kitchen', label: 'Kitchen', icon: ChefHat },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'setup', label: 'Setup', icon: Settings2 },
];

interface RailProps {
  view: RestaurantView;
  allowed: (view: RestaurantView) => boolean;
  badges: Partial<Record<RestaurantView, number>>;
  onSelect: (view: RestaurantView) => void;
  onExit: () => void;
}

/** Left navigation rail: large touch targets, a count badge per section (open orders, ready tickets). */
export function RestaurantRail({ view, allowed, badges, onSelect, onExit }: RailProps) {
  return (
    <nav className="flex w-[92px] shrink-0 flex-col items-stretch gap-1 border-r border-border/60 bg-card/60 px-2 py-3">
      <div className="mb-3 flex flex-col items-center gap-1 text-primary">
        <div className="rounded-2xl bg-primary/10 p-2.5"><UtensilsCrossed className="h-6 w-6" /></div>
        <span className="text-[10px] font-black uppercase tracking-widest">Restaurant</span>
      </div>
      {NAV.filter(n => allowed(n.key)).map(n => {
        const active = view === n.key;
        const badge = badges[n.key];
        return (
          <button key={n.key} type="button" onClick={() => onSelect(n.key)} title={n.label}
            className={`relative flex flex-col items-center gap-1 rounded-2xl px-1 py-3 text-[11px] font-bold leading-tight transition-all active:scale-95 ${active ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <n.icon className="h-5 w-5" />
            <span className="text-center">{n.label}</span>
            {!!badge && (
              <span className={`absolute right-1.5 top-1.5 min-w-[18px] rounded-full px-1 text-[10px] font-black leading-[18px] ${active ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'}`}>{badge}</span>
            )}
          </button>
        );
      })}
      <div className="flex-1" />
      <button type="button" onClick={onExit} title="Back"
        className="flex flex-col items-center gap-1 rounded-2xl px-1 py-3 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground">
        <ArrowLeft className="h-5 w-5" />Back
      </button>
    </nav>
  );
}

interface TopBarProps {
  title: string;
  subtitle?: string;
  stats: { freeTables: number; totalTables: number; openOrders: number; ready: number; openValue: number };
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

/** Page title with the live state of the restaurant and the quick "new order" buttons. */
export function RestaurantTopBar({ title, subtitle, stats, onNewTakeaway, onNewDelivery }: TopBarProps) {
  const now = useClock();
  const stat = (label: string, value: string, tone = 'text-foreground') => (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card px-3 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-sm font-black tabular-nums ${tone}`}>{value}</span>
    </div>
  );
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3">
      <div className="mr-2 min-w-[160px]">
        <h1 className="text-xl font-black leading-tight">{title}</h1>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          {subtitle ? ` · ${subtitle}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {stat('Tables free', `${stats.freeTables} / ${stats.totalTables}`)}
        {stat('Open orders', String(stats.openOrders))}
        {stat('Ready to serve', String(stats.ready), stats.ready > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}
        {stat('Running value', formatCurrency(stats.openValue))}
      </div>
      <div className="ml-auto flex gap-2">
        {onNewTakeaway && (
          <button type="button" onClick={onNewTakeaway} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm active:scale-95">
            <ShoppingBag className="h-4 w-4" />Takeaway
          </button>
        )}
        {onNewDelivery && (
          <button type="button" onClick={onNewDelivery} className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold active:scale-95">
            <Bike className="h-4 w-4" />Delivery
          </button>
        )}
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
