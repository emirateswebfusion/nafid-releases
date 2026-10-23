/** Summary stat card at the top of Sales History. */
import clsx from 'clsx';

/* ─── Stat Card ─── */
export function StatCard({
  icon: Icon,
  label,
  value,
  colorClass,
  bgClass,
  sub,
}: {
  icon: any;
  label: string;
  value: string;
  colorClass: string;
  bgClass: string;
  sub?: string;
}) {
  const gradMap: Record<string, string> = {
    'text-emerald-500': 'from-emerald-500/10 to-emerald-500/5',
    'text-blue-500': 'from-blue-500/10 to-blue-500/5',
    'text-violet-500': 'from-violet-500/10 to-violet-500/5',
    'text-rose-500': 'from-rose-500/10 to-rose-500/5',
    'text-amber-500': 'from-amber-500/10 to-amber-500/5',
  };
  const gradient = gradMap[colorClass] || 'from-primary/10 to-primary/5';

  return (
    <div className="bg-card border border-border p-5 rounded-[24px] flex items-center gap-4 hover:border-primary/25 hover:shadow-md transition-all duration-300 group select-none min-w-0 flex-1">
      <div className={clsx('p-3 rounded-xl shrink-0 shadow-inner bg-gradient-to-br', gradient)}>
        <Icon className={clsx('w-5 h-5', colorClass)} />
      </div>
      <div className="leading-tight text-left min-w-0 flex-1">
        <p className="text-xl font-black text-foreground font-mono truncate">{value}</p>
        <p className="text-[9px] text-muted-foreground/80 font-bold uppercase tracking-wider mt-0.5">{label}</p>
        {sub && <p className="text-[9px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
