import { Search, UserX, X } from 'lucide-react';
import clsx from 'clsx';
import { Skeleton } from '../../ui/Skeleton';
import { formatCurrency } from '../../../utils/pricing/money';
import type { StaffManagerState } from '../hooks/useStaffManagerState';
import { StaffAvatar } from './staffUi';
import { STAFF_PANEL, balanceTone } from './staffStyle';

export interface StaffListProps {
  sm: StaffManagerState;
}

/** Staff list with search and status filters. */
export function StaffList({
  sm,
}: StaffListProps) {
  const { loading, searchQuery, selectedStaffId, setSearchQuery, setSelectedStaffId, setStatusFilter, staffList, statusFilter } = sm;

  return (
    <aside className={clsx(STAFF_PANEL, 'w-[300px] flex flex-col shrink-0 overflow-hidden')}>
      {/* Search & Status Filters */}
      <div className="p-4 space-y-3 border-b border-border/60">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">Team Directory</h2>
          <span className="text-[11px] font-semibold text-muted-foreground tabular-nums px-2 py-0.5 rounded-full bg-muted/70">
            {staffList.length}
          </span>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name or code"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-9.5 pl-9 pr-8 text-[13px] bg-background border border-border/80 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 text-foreground placeholder:text-muted-foreground/60 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground cursor-pointer p-1 rounded-md hover:bg-muted"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 rounded-xl bg-muted/60 p-1 gap-1">
          {(['ACTIVE', 'INACTIVE', 'ALL'] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={clsx(
                'h-7 text-[11.5px] font-semibold rounded-lg transition-all cursor-pointer capitalize',
                statusFilter === st
                  ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {st.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Directory List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="p-2 space-y-2">
            <Skeleton className="h-15 w-full rounded-xl" />
            <Skeleton className="h-15 w-full rounded-xl" />
            <Skeleton className="h-15 w-full rounded-xl" />
          </div>
        ) : staffList.length === 0 ? (
          <div className="px-6 py-12 text-center flex flex-col items-center">
            <div className="w-11 h-11 rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center mb-3">
              <UserX className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <p className="text-[13px] font-semibold text-foreground">No staff found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[210px] leading-relaxed">
              {searchQuery ? 'No employees match your search.' : 'Use "Add Staff" to register an employee.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          staffList.map(s => {
            const isSelected = s.staff_id === selectedStaffId;
            const isInactive = s.status === 'INACTIVE';
            const balance = Number(s.current_balance) || 0;
            const tone = balanceTone(balance);

            return (
              <button
                type="button"
                key={s.staff_id}
                onClick={() => setSelectedStaffId(s.staff_id)}
                className={clsx(
                  'relative w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-xl cursor-pointer transition-all select-none',
                  isSelected
                    ? 'bg-primary/[0.07] ring-1 ring-primary/25'
                    : 'hover:bg-muted/60'
                )}
              >
                {isSelected && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-primary" />}
                <div className="relative">
                  <StaffAvatar name={s.name} size="sm" muted={!isSelected} />
                  <span
                    className={clsx(
                      'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card',
                      isInactive ? 'bg-muted-foreground/50' : 'bg-emerald-500'
                    )}
                    title={isInactive ? 'Inactive' : 'Active'}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={clsx('text-[13px] font-semibold truncate', isInactive ? 'text-muted-foreground' : 'text-foreground')}>
                      {s.name}
                    </p>
                    <span className={clsx('text-[11.5px] font-semibold tabular-nums shrink-0', balance === 0 ? 'text-muted-foreground/70' : tone.text)}>
                      {balance === 0 ? '—' : formatCurrency(Math.abs(balance))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[11.5px] text-muted-foreground truncate">{s.role_designation || 'Staff Member'}</p>
                    <span className="text-[10.5px] font-mono text-muted-foreground/70 shrink-0">{s.staff_code}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
