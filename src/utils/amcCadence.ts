import { AmcFrequency } from '@/domain/types';

const intervalMonths: Record<AmcFrequency, number> = {
  MONTHLY: 1,
  BI_MONTHLY: 2,
  QUARTERLY: 3,
  FOUR_MONTHLY: 4,
  HALF_YEARLY: 6,
  YEARLY: 12,
  CUSTOM: 3,
  ON_DEMAND: 12,
};

function addMonthsSafely(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  if (result.getUTCDate() !== day) result.setUTCDate(0);
  return result;
}

export function getAmcCadenceSlotCount(
  start: string,
  end: string,
  frequency: AmcFrequency
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 0;
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const startDate = new Date(Date.UTC(sy, sm - 1, sd));
  const endDate = new Date(Date.UTC(ey, em - 1, ed));
  if (
    startDate.toISOString().slice(0, 10) !== start ||
    endDate.toISOString().slice(0, 10) !== end ||
    endDate < startDate
  ) return 0;

  let count = 0;
  for (let current = startDate; current <= endDate; current = addMonthsSafely(current, intervalMonths[frequency])) {
    count++;
  }
  return count;
}
