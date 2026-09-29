// Alan, konu ve seviye listeleri. Sunucu doğrulamada, arayüz açılır listelerde kullanır.

export const LANGS = ['tr', 'en'];
export const MIXED = 'mixed';

// Her alan aynı eğitim seviyelerini kullanır: yazılımla ilkokulda da, meslek lisesinde de uğraşılır.
export const LEVELS = ['primary', 'middle', 'high', 'university', 'masters'];

export const AREAS = {
  general: {
    topics: ['math', 'science', 'history', 'geography', 'literature', 'general'],
  },
  software: {
    topics: ['basics', 'algorithms', 'html-css', 'python', 'javascript', 'sql', 'git', 'security', 'csharp'],
    // Her konunun sorulduğu seviye aralığı: ilkokulda kodlamaya giriş, ortaokulda ilk diller,
    // lisede (meslek liseleri dahil) veritabanı, sürüm kontrolü ve güvenlik.
    ranges: {
      basics: ['primary', 'high'],
      algorithms: ['middle', 'masters'],
      'html-css': ['middle', 'masters'],
      python: ['middle', 'masters'],
      javascript: ['high', 'masters'],
      sql: ['high', 'masters'],
      git: ['high', 'masters'],
      security: ['high', 'masters'],
      csharp: ['high', 'masters'],
    },
  },
};

function inRange(level, [from, to]) {
  const index = LEVELS.indexOf(level);
  return index >= LEVELS.indexOf(from) && index <= LEVELS.indexOf(to);
}

/** Seçilen alan ve seviyede sorulabilen konular ("Karışık" hariç). */
export function topicsFor(area, level) {
  const { topics, ranges } = AREAS[area];
  return ranges ? topics.filter((topic) => inRange(level, ranges[topic])) : topics;
}

// Seçim geçerli mi: alan ve seviye var mı, konu o alanda ve o seviyede soruluyor mu.
export function isValidSelection({ area, topic, level }) {
  if (!Object.hasOwn(AREAS, area) || !LEVELS.includes(level)) return false;
  return topic === MIXED || topicsFor(area, level).includes(topic);
}