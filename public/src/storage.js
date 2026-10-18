// Ayarları tarayıcıda saklar.
// Okunan veriye güvenilmez: bozuk, eksik ya da beklenmeyen değer varsa varsayılan kullanılır.
import { AREAS, DIFFICULTIES, LANGS, MIXED, OLD_LEVELS, difficultyFromLevel, isValidSelection, topicsFor } from './topics.js';
import { isDayKey } from './dates.js';
import { EMPTY_STATS, MAX_MISTAKES, MAX_SEEN } from './progress.js';

export const STORAGE_KEY = 'quiz-settings';
export const THEMES = ['dark', 'light'];
// 2: okul seviyeleri yerine zorluk (kategori + zorluk sürümü)
export const VERSION = 2;

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

// "general:geography:easy" gibi bir seçim anahtarı gerçekten geçerli mi?
const isSelectionKey = (key) => {
  const [area, topic, difficulty] = String(key).split(':');
  return isValidSelection({ area, topic, difficulty });
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

// Yanlış cevaplanan soruların kimlikleri ("science:medium:004", "gen:capital:medium:JP", "ai:film-music:hard:0a1b2c3d4e").
const MISTAKE_ID = /^[a-z-]+:[a-z-]+:[A-Za-z0-9.:]{1,60}$/;

function readIds(saved, max) {
  const ids = Array.isArray(saved) ? saved.filter((id) => typeof id === 'string' && MISTAKE_ID.test(id)) : [];
  return [...new Set(ids)].slice(-max);
}

// Seçim başına görülen sorular: { "general:geography:easy": [kimlikler] }
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

/** Eski anahtar ("general:history:middle") → yeni ("general:history:easy"); çevrilemezse null. */
function migrateKey(key) {
  const [area, topic, level] = String(key).split(':');
  if (!OLD_LEVELS.includes(level)) return null;
  const difficulty = difficultyFromLevel(topic, level);
  const next = `${area}:${topic}:${difficulty}`;
  return difficulty && isSelectionKey(next) ? next : null;
}

/**
 * İlk sürümde kaydedilmiş ayarları yeni biçime çevirir. Keşfedilen konular ve en iyi puanlar taşınır
 * (iki seviye aynı zorluğa düşerse büyük puan kalır). Eski soru kimlikleri artık var olmadığı için
 * "Hatalarım" ve görülen sorular listesi sıfırlanır; sayılar, seri ve rozet sayaçları olduğu gibi kalır.
 */
export function migrate(saved) {
  if (saved.version >= VERSION) return saved;
  const stats = asObject(saved.stats);
  const topics = (Array.isArray(stats.topics) ? stats.topics : []).map(migrateKey).filter(Boolean);
  const best = {};
  for (const [key, score] of Object.entries(asObject(stats.best))) {
    const next = migrateKey(key);
    if (next && count(score) === score) best[next] = Math.max(best[next] ?? 0, score);
  }
  const { mastersHigh, ...rest } = stats;
  return {
    ...saved,
    version: VERSION,
    difficulty: saved.level ? difficultyFromLevel(saved.topic, saved.level) : saved.difficulty,
    stats: { ...rest, hardHigh: mastersHigh, topics, best },
    mistakes: [],
    seen: {},
  };
}

/** Kategori kartları: alandaki konular, en sonda "Karışık". */
export function topicsOf(area) {
  return [...topicsFor(area), MIXED];
}

export function loadSettings(storage = browserStorage(), fallbackLang = 'tr') {
  const saved = migrate(asObject(readJson(storage)));
  const area = oneOf(saved.area, Object.keys(AREAS), 'general');
  const topics = topicsOf(area);
  return {
    lang: oneOf(saved.lang, LANGS, fallbackLang),
    theme: oneOf(saved.theme, THEMES, 'dark'),
    area,
    difficulty: oneOf(saved.difficulty, DIFFICULTIES, DIFFICULTIES[0]),
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
  const { lang, theme, area, topic, difficulty, streak, daily, stats, mistakes, seen } = settings;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: VERSION, lang, theme, area, topic, difficulty, streak, daily, stats, mistakes, seen }),
    );
    return true;
  } catch {
    return false;
  }
}
