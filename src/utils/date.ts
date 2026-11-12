const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const SHORT_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  timeZone: 'UTC',
});

/**
 * Returns today's calendar date in Asia/Kolkata (IST) as YYYY-MM-DD.
 * Prevents off-by-one date shifts between 00:00 and 05:30 IST.
 */
export function getIstTodayIso(now: Date = new Date()): string {
  return IST_DATE_FORMATTER.format(now);
}

/**
 * Adds a signed number of calendar days to an ISO date (or IST today) safely.
 */
export function addDaysIstIso(base: string | Date = new Date(), days: number = 0): string {
  const baseIso = typeof base === 'string' ? base.slice(0, 10) : getIstTodayIso(base);
  const [y, m, d] = baseIso.split('-').map(Number);
  if (!y || !m || !d) {
    return getIstTodayIso();
  }
  const utcDate = new Date(Date.UTC(y, m - 1, d + days));
  return utcDate.toISOString().slice(0, 10);
}

/**
 * Adds a signed number of calendar years (and optional day offset) to a YYYY-MM-DD date.
 */
export function addYearsIstIso(
  base: string | Date = new Date(),
  years: number = 1,
  dayOffset: number = 0
): string {
  const baseIso = typeof base === 'string' ? base.slice(0, 10) : getIstTodayIso(base);
  const [y, m, d] = baseIso.split('-').map(Number);
  if (!y || !m || !d) {
    return getIstTodayIso();
  }
  const utcDate = new Date(Date.UTC(y + years, m - 1, d + dayOffset));
  return utcDate.toISOString().slice(0, 10);
}

/**
 * Returns the short weekday label (Mon, Tue, ...) for a YYYY-MM-DD calendar date.
 */
export function getCalendarWeekdayShort(dateIso: string): string {
  const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return SHORT_WEEKDAY_FORMATTER.format(new Date(Date.UTC(y, m - 1, d)));
}

