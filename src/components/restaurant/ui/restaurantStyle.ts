import type { KdsStatus } from '../../../data/restaurant';
import type { TableState } from '../restaurantRules';

/** Visual tokens of restaurant mode (no business rules here). */

/** Badge colours per delivery app, close to each app's own colour so staff recognise them at a glance. */
const CHANNEL_STYLE: Record<string, { label: string; className: string }> = {
  OWN: { label: 'Own delivery', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/30' },
  TALABAT: { label: 'Talabat', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30' },
  DELIVEROO: { label: 'Deliveroo', className: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30' },
  NOON: { label: 'Noon Food', className: 'bg-yellow-400/20 text-yellow-800 dark:text-yellow-200 border-yellow-500/40' },
  CAREEM: { label: 'Careem', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  SWIGGY: { label: 'Swiggy', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30' },
  ZOMATO: { label: 'Zomato', className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30' },
  OTHER: { label: 'Other app', className: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30' },
};

export function channelStyle(channel: string | null | undefined) {
  return CHANNEL_STYLE[(channel ?? 'OWN').toUpperCase()] ?? CHANNEL_STYLE.OTHER;
}

/** Table tile colours: status stripe, tile surface and legend dot. */
export const TABLE_STYLE: Record<TableState, { label: string; stripe: string; tile: string; dot: string }> = {
  free: { label: 'Free', stripe: 'bg-border', tile: 'border-dashed border-border bg-card hover:border-primary/60 hover:bg-primary/5', dot: 'bg-muted-foreground/40' },
  occupied: { label: 'Occupied', stripe: 'bg-sky-500', tile: 'border-sky-500/60 bg-sky-500/[0.08] hover:bg-sky-500/[0.14]', dot: 'bg-sky-500' },
  billed: { label: 'Billed', stripe: 'bg-indigo-500', tile: 'border-indigo-500/60 bg-indigo-500/[0.08] hover:bg-indigo-500/[0.14]', dot: 'bg-indigo-500' },
  billing: { label: 'In payment', stripe: 'bg-amber-500', tile: 'border-amber-500/60 bg-amber-500/[0.08] hover:bg-amber-500/[0.14]', dot: 'bg-amber-500' },
  ready: { label: 'Food ready', stripe: 'bg-emerald-500', tile: 'border-emerald-500/60 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14]', dot: 'bg-emerald-500' },
};

/** Minutes a table or ticket has waited → text colour (calm, then amber, then red). */
export function ageTone(minutes: number, warnAfter: number, lateAfter: number): string {
  if (minutes >= lateAfter) return 'text-rose-600 dark:text-rose-400';
  if (minutes >= warnAfter) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

export const KDS_COLUMN_STYLE: Record<Exclude<KdsStatus, 'SERVED'>, { title: string; header: string; action: string; next: string }> = {
  NEW: { title: 'New', header: 'bg-sky-500', action: 'bg-sky-600 hover:bg-sky-700', next: 'Start cooking' },
  PREPARING: { title: 'Preparing', header: 'bg-amber-500', action: 'bg-amber-600 hover:bg-amber-700', next: 'Mark ready' },
  READY: { title: 'Ready', header: 'bg-emerald-500', action: 'bg-emerald-600 hover:bg-emerald-700', next: 'Served' },
};

/** Elapsed time as "7 min" / "1 h 05". */
export function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}
