// Ayarları tarayıcıda saklar.
// Okunan veriye güvenilmez: bozuk, eksik ya da beklenmeyen değer varsa varsayılan kullanılır.
import { AREAS, LANGS, LEVELS, MIXED, isValidSelection, topicsFor } from './topics.js';
import { isDayKey } from './dates.js';
import { EMPTY_STATS, MAX_MISTAKES, MAX_SEEN } from './progress.js';

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

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

// "general:geography:high" gibi bir seçim anahtarı gerçekten geçerli mi?
const isSelectionKey = (key) => {
  const [area, topic, level] = String(key).split(':');
  return isValidSelection({ area, topic, level });
};

function readStats(saved) {
  const stats = asObject(saved);
  const counts = Object.keys(EMPTY_STATS).filter((key) => typeof EMPTY_STATS[key] === 'number');
  const topics = Array.isArray(stats.topics) ? stats.topics.filter(isSelectionKey) : [];
  const best = Object.entries(asObject(stats.best)).filter(([key, score]) => isSelectionKey(key) && count(score) === score);
  return {
    ...Object.fromEntries(counts.map((key) => [key, count(stats[key])])),
    topics: [...new Set(topics)].slice(0, 200),
    best: Object.fromEntries(best.slice(0, 200)),
  };
}

// Yanlış cevaplanan soruların kimlikleri ("science:high:004", "gen:capital:high:JP").
const MISTAKE_ID = /^[a-z-]+:[a-z]+:[A-Za-z0-9.:]{1,60}$/;

function readIds(saved, max) {
  const ids = Array.isArray(saved) ? saved.filter((id) => typeof id === 'string' && MISTAKE_ID.test(id)) : [];
  return [...new Set(ids)].slice(-max);
}

// Seçim başına görülen sorular: { "general:geography:high": [kimlikler] }
function readSeen(saved) {
  const entries = Object.entries(asObject(saved)).filter(([key]) => isSelectionKey(key)).slice(0, 100);
  return Object.fromEntries(entries.map(([key, ids]) => [key, readIds(ids, MAX_SEEN)]));
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
    stats: readStats(saved.stats),
    mistakes: readIds(saved.mistakes, MAX_MISTAKES),
    seen: readSeen(saved.seen),
  };
}

/** Sadece bilinen alanlar yazılır. Kaydedilemezse (depolama dolu/kapalı) uygulama yine çalışır. */
export function saveSettings(settings, storage = browserStorage()) {
  const { lang, theme, area, topic, level, streak, daily, stats, mistakes, seen } = settings;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ lang, theme, area, topic, level, streak, daily, stats, mistakes, seen }));
    return true;
  } catch {
    return false;
  }
}
