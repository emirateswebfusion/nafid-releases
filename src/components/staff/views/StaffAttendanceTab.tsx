import clsx from 'clsx';
import { buildAttendanceMonth } from '../../../utils/time/staffAttendance';
import { CalendarCheck } from 'lucide-react';
import type { StaffMember } from '../staffTypes';
import type { StaffManagerState } from '../hooks/useStaffManagerState';
import { EmptyState, SectionCard } from './staffUi';
import { STAFF_TD, STAFF_TH } from './staffStyle';

export interface StaffAttendanceTabProps {
  handleMarkAttendance: (staffId: string, date: string, status: "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "HOLIDAY") => Promise<void>;
  /** Rendered only while it is set. */
  selectedStaff: StaffMember;
  sm: StaffManagerState;
}

const STATUS_STYLE: Record<string, string> = {
  PRESENT: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  ABSENT: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
};
const OTHER_STATUS_STYLE = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
const MARK_OPTIONS = [
  { status: 'PRESENT', label: 'Present' },
  { status: 'ABSENT', label: 'Absent' },
  { status: 'HALF_DAY', label: 'Half' },
  { status: 'LEAVE', label: 'Leave' },
  { status: 'HOLIDAY', label: 'Holiday' },
] as const;

/** Selected staff member's attendance tab. */
export function StaffAttendanceTab({
  handleMarkAttendance, selectedStaff, sm,
}: StaffAttendanceTabProps) {
  const { attendanceRecords, selectedMonth, setSelectedMonth } = sm;
  const days = buildAttendanceMonth(selectedMonth, attendanceRecords);
  return (
    <SectionCard
      icon={CalendarCheck}
      title="Attendance"
      description="Daily presence, leave and half days"
      flush
      action={
        <input
          type="month"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="h-8.5 px-3 bg-background border border-border/80 rounded-xl text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      }
    >
      {days.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No attendance logged" hint={`Nothing recorded for ${selectedMonth}.`} />
      ) : (
        <table className="w-full text-left text-[13px] border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              <th className={STAFF_TH}>Date</th>
              <th className={STAFF_TH}>Status</th>
              <th className={clsx(STAFF_TH, 'text-right')}>Mark as</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {days.map(a => (
              <tr key={a.attendance_id} className="hover:bg-muted/30 transition-colors">
                <td className={clsx(STAFF_TD, 'font-medium text-foreground tabular-nums')}>{a.date}</td>
                <td className={STAFF_TD}>
                  <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize', STATUS_STYLE[a.status] || OTHER_STATUS_STYLE)}>
                    {String(a.status).replace(/_/g, ' ').toLowerCase()}
                  </span>
                </td>
                <td className={clsx(STAFF_TD, 'text-right')}>
                  <div className="inline-flex rounded-lg bg-muted/60 p-0.5 gap-0.5">
                    {MARK_OPTIONS.map(opt => (
                      <button
                        type="button"
                        key={opt.status}
                        onClick={() => handleMarkAttendance(selectedStaff.staff_id, a.date, opt.status)}
                        className={clsx(
                          'px-2.5 h-7 rounded-md text-[11px] font-semibold transition-all cursor-pointer',
                          a.status === opt.status
                            ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}
