import { Search, UserX } from 'lucide-react';
import clsx from 'clsx';
import { Skeleton } from '../../ui/Skeleton';
import { formatCurrency } from '../../../utils/pricing/money';
import type { StaffManagerState } from '../hooks/useStaffManagerState';

export interface StaffListProps {
  sm: StaffManagerState;
}

/** Staff list with search and the add / upload actions. */
export function StaffList({
  sm,
}: StaffListProps) {
  const { loading, searchQuery, selectedStaffId, setSearchQuery, setSelectedStaffId, setStatusFilter, staffList, statusFilter } = sm;
  return (
    <div className="w-80 border-r border-border bg-card flex flex-col shrink-0">
      {/* Search & Status Filters */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search staff..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-background border border-border rounded-xl outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/60 transition-all"
          />
        </div>
        <div className="flex rounded-lg bg-muted/40 p-1 gap-1">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={clsx(
                'flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer capitalize',
                statusFilter === st ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {st.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Directory List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40">
        {loading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : staffList.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <UserX className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs font-bold">No staff records found</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">Click "Add Staff Member" to create your first employee record without requiring a login account.</p>
          </div>
        ) : (
          staffList.map(s => {
            const isSelected = s.staff_id === selectedStaffId;
            const isInactive = s.status === 'INACTIVE';
            return (
              <div
                key={s.staff_id}
                onClick={() => setSelectedStaffId(s.staff_id)}
                className={clsx(
                  'p-3.5 flex items-center gap-3 cursor-pointer transition-all border-l-4',
                  isSelected
                    ? 'bg-primary/5 border-l-primary shadow-inner'
                    : 'border-l-transparent hover:bg-muted/30',
                  isInactive && 'opacity-60 grayscale'
                )}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0">
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-bold text-foreground truncate">{s.name}</p>
                    <span className={clsx(
                      'text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider',
                      s.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-500'
                    )}>
                      {s.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{s.role_designation || 'Staff Member'}</p>
                  <div className="flex items-center justify-between gap-1 mt-1 text-[10px] font-bold text-muted-foreground">
                    <span className="font-mono text-muted-foreground/70">{s.staff_code}</span>
                    <span className={clsx((s.current_balance ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600')}>
                      Bal: {formatCurrency(s.current_balance)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
