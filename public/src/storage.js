// Ayarları tarayıcıda saklar.
// Okunan veriye güvenilmez: bozuk, eksik ya da beklenmeyen değer varsa varsayılan kullanılır.
import { AREAS, LANGS, LEVELS, MIXED, topicsFor } from './topics.js';
import { isDayKey } from './dates.js';

export const STORAGE_KEY = 'quiz-settings';
export const THEMES = ['dark', 'light'];

/** Gizli sekmede ya da çerezler engelliyken localStorage'a erişmek bile hata fırlatabilir. */
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJson(storage) {
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);

function readStreak(saved) {
  const streak = saved && typeof saved === 'object' ? saved : {};
  const current = count(streak.count);
  return {
    count: current,
    best: Math.max(count(streak.best), current),
    lastDay: isDayKey(streak.lastDay) ? streak.lastDay : null,
  };
}

// Günün sorusunun sonucu: { date, correct } ya da hiç çözülmediyse null.
function readDaily(saved) {
  return saved && isDayKey(saved.date) && typeof saved.correct === 'boolean'
    ? { date: saved.date, correct: saved.correct }
    : null;
}

/** Açılır listedeki konular: o alanda ve seviyede sorulanlar, en sonda "Karışık". */
export function topicsOf(area, level) {
  return [...topicsFor(area, level), MIXED];
}

export function loadSettings(storage = browserStorage(), fallbackLang = 'tr') {
  const saved = readJson(storage);
  const area = oneOf(saved.area, Object.keys(AREAS), 'general');
  const level = oneOf(saved.level, LEVELS, LEVELS[0]);
  const topics = topicsOf(area, level);
  return {
    lang: oneOf(saved.lang, LANGS, fallbackLang),
    theme: oneOf(saved.theme, THEMES, 'dark'),
    area,
    level,
    topic: oneOf(saved.topic, topics, topics[0]),
    streak: readStreak(saved.streak),
    daily: readDaily(saved.daily),
  };
}

/** Sadece bilinen alanlar yazılır. Kaydedilemezse (depolama dolu/kapalı) uygulama yine çalışır. */
export function saveSettings(settings, storage = browserStorage()) {
  const { lang, theme, area, topic, level, streak, daily } = settings;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ lang, theme, area, topic, level, streak, daily }));
    return true;
  } catch {
    return false;
  }
}
