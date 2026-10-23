import clsx from 'clsx';
import type { StaffMember } from '../staffTypes';
import type { StaffManagerState } from '../hooks/useStaffManagerState';

export interface StaffAttendanceTabProps {
  handleMarkAttendance: (staffId: string, date: string, status: "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "HOLIDAY") => Promise<void>;
  /** Rendered only while it is set. */
  selectedStaff: StaffMember;
  sm: StaffManagerState;
}

/** Selected staff member's attendance tab. */
export function StaffAttendanceTab({
  handleMarkAttendance, selectedStaff, sm,
}: StaffAttendanceTabProps) {
  const { attendanceRecords, selectedMonth, setSelectedMonth } = sm;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-extrabold text-foreground">Staff Attendance Grid</h3>
          <p className="text-xs text-muted-foreground">Track daily presence, leaves, and working shifts</p>
        </div>
        <input
          type="month"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="px-3 py-1.5 bg-card border border-border rounded-xl text-xs font-bold text-foreground outline-none"
        />
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30 font-black text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30 font-medium">
            {attendanceRecords.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-8 text-center text-muted-foreground">
                  No attendance records logged for {selectedMonth}
                </td>
              </tr>
            ) : (
              attendanceRecords.map(a => (
                <tr key={a.attendance_id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-foreground">{a.date}</td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
                      a.status === 'PRESENT' ? 'bg-emerald-500/10 text-emerald-600' :
                      a.status === 'ABSENT' ? 'bg-rose-500/10 text-rose-500' :
                      'bg-amber-500/10 text-amber-600'
                    )}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'] as const).map(st => (
                        <button
                          key={st}
                          onClick={() => handleMarkAttendance(selectedStaff.staff_id, a.date, st)}
                          className={clsx(
                            'px-2 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer',
                            a.status === st ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {st[0]}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
