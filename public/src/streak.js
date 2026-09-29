// Günlük seri: her gün en az bir tur bitirmek ya da günün sorusunu cevaplamak seriyi sürdürür.
// Saf fonksiyonlar; aynı dosya hangman ve tic-tac-toe'ya da taşınabilir.
import { previousDay } from './dates.js';

export const EMPTY_STREAK = Object.freeze({ count: 0, best: 0, lastDay: null });

/** Bugün oynandı: seri bir artar, gün atlandıysa 1'den başlar. Yeni bir nesne döner. */
export function recordDay(streak, today) {
  const { count, best, lastDay } = streak;
  if (lastDay === today) return streak;
  if (lastDay && lastDay > today) return streak; // cihazın saati geri alınmış; seriyi bozma
  const next = lastDay === previousDay(today) ? count + 1 : 1;
  return { count: next, best: Math.max(best, next), lastDay: today };
}

/** Ekranda gösterilen seri: dün ya da bugün oynanmadıysa seri bitmiştir. */
export function currentStreak(streak, today) {
  const { count, lastDay } = streak;
  return lastDay === today || lastDay === previousDay(today) ? count : 0;
}