/** Show every day so a month with no attendance can still be marked. */
export function buildAttendanceMonth<T extends { date: string; status: string; attendance_id: string }>(month: string, records: T[]) {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  const [year, number] = month.split('-').map(Number);
  if (number < 1 || number > 12) return [];
  const days = new Date(year, number, 0).getDate();
  const byDate = new Map(records.map(row => [row.date, row]));
  return Array.from({ length: days }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    return byDate.get(date) || { date, status: 'NOT_MARKED', attendance_id: date };
  });
}
