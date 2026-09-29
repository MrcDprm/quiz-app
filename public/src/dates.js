// Gün anahtarları ("2026-09-30"). Hem sunucu hem tarayıcı kullanır.

// Günün sorusu herkes için İstanbul saatiyle gece yarısı değişir.
export const DAILY_TIME_ZONE = 'Europe/Istanbul';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const isDayKey = (value) => typeof value === 'string' && DAY_KEY.test(value);

/** Verilen andaki takvim günü; saat dilimi verilmezse cihazın kendi saat dilimi. */
export function dayKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Bir önceki gün: "2026-03-01" → "2026-02-28". UTC ile hesaplanır, yaz saati etkilemez. */
export function previousDay(key) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}