export const getLocalDateString = (date: Date = new Date(), timeZone = 'Asia/Karachi'): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

const getLocalDateParts = (date: Date, timeZone = 'Asia/Karachi') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const partMap = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour: Number(partMap.hour),
    minute: Number(partMap.minute)
  };
};

export const getShiftAdjustedMinutes = (
  date: Date,
  shiftStart: string,
  shiftEnd: string,
  timeZone = 'Asia/Karachi'
) => {
  const { hour, minute } = getLocalDateParts(date, timeZone);
  const currentMinutes = hour * 60 + minute;
  const [startHour, startMinute] = shiftStart.split(':').map(Number);
  const [endHour, endMinute] = shiftEnd.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const isOvernight = endMinutes <= startMinutes;
  const adjustedCurrent = isOvernight && currentMinutes < endMinutes
    ? currentMinutes + 24 * 60
    : currentMinutes;
  return { currentMinutes: adjustedCurrent, startMinutes };
};

export const addDaysToDateString = (dateStr: string, days: number): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  return utcDate.toISOString().split('T')[0];
};

export const getShiftDateString = (
  date: Date,
  shiftStart: string,
  shiftEnd: string,
  timeZone = 'Asia/Karachi'
): string => {
  const localDate = getLocalDateString(date, timeZone);
  const { hour, minute } = getLocalDateParts(date, timeZone);
  const currentMinutes = hour * 60 + minute;
  const [startHour, startMinute] = shiftStart.split(':').map(Number);
  const [endHour, endMinute] = shiftEnd.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const isOvernight = endMinutes <= startMinutes;
  if (!isOvernight) return localDate;
  if (currentMinutes < endMinutes) {
    return addDaysToDateString(localDate, -1);
  }
  return localDate;
};

export const getWeekdayLabel = (dateStr: string, timeZone = 'Asia/Karachi'): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(utcDate);
};

export const getLocalTimeMinutes = (date: Date, timeZone = 'Asia/Karachi'): number => {
  const { hour, minute } = getLocalDateParts(date, timeZone);
  return hour * 60 + minute;
};
