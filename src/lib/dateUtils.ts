export function isDateClosed(dailyClosings: { closing_date: string; shift?: string }[], date: string, shift?: string): boolean {
  return dailyClosings.some(c => {
    const d = new Date(c.closing_date).toISOString().split('T')[0];
    if (d !== date) return false;
    // Sin `shift`: el día completo está cerrado (compat 1 turno).
    if (shift === undefined) return true;
    return (c.shift || '1') === shift;
  });
}
