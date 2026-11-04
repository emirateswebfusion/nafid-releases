import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { STAFF_PANEL, staffInitials } from './staffStyle';

/** Shared components of the staff screen: avatars, status pill, section cards and empty states. */

export function StaffAvatar({ name, size = 'md', muted = false }: { name?: string | null; size?: 'sm' | 'md' | 'lg'; muted?: boolean }) {
  return (
    <div
      className={clsx(
        'shrink-0 flex items-center justify-center font-bold tracking-tight select-none',
        size === 'sm' && 'w-9 h-9 rounded-xl text-xs',
        size === 'md' && 'w-11 h-11 rounded-xl text-sm',
        size === 'lg' && 'w-16 h-16 rounded-2xl text-xl',
        muted
          ? 'bg-muted text-muted-foreground border border-border/70'
          : 'bg-gradient-to-br from-primary to-indigo-600 text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.55),inset_0_1px_0_rgba(255,255,255,0.25)]'
      )}
    >
      {staffInitials(name)}
    </div>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border',
        active
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
          : 'bg-muted text-muted-foreground border-border/70'
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-muted-foreground/60')} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export interface SectionCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Remove body padding (tables and lists that run edge to edge). */
  flush?: boolean;
  className?: string;
}

export function SectionCard({ icon: Icon, title, description, action, children, flush = false, className }: SectionCardProps) {
  return (
    <section className={clsx(STAFF_PANEL, 'overflow-hidden', className)}>
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground tracking-tight">{title}</h3>
            {description && <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
      </header>
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

/** Label / value row used in detail lists. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right min-w-0 truncate">{children}</span>
    </div>
  );
}

/** Centered empty state inside a section card. */
export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="py-12 px-6 flex flex-col items-center text-center">
      <div className="w-11 h-11 rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-muted-foreground/60" />
      </div>
      <p className="text-[13px] font-semibold text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">{hint}</p>}
    </div>
  );
}
