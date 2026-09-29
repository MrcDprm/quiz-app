// Ayarları tarayıcıda saklar.
// Okunan veriye güvenilmez: bozuk, eksik ya da beklenmeyen değer varsa varsayılan kullanılır.
import { AREAS, LANGS, LEVELS, MIXED, topicsFor } from './topics.js';

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
  };
}

/** Sadece bilinen alanlar yazılır. Kaydedilemezse (depolama dolu/kapalı) uygulama yine çalışır. */
export function saveSettings(settings, storage = browserStorage()) {
  const { lang, theme, area, topic, level } = settings;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ lang, theme, area, topic, level }));
    return true;
  } catch {
    return false;
  }
}
