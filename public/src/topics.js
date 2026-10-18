// Alan, konu ve zorluk listeleri. Sunucu doğrulamada, arayüz kategori kartlarında kullanır.

export const LANGS = ['tr', 'en'];
export const MIXED = 'mixed';

// Her konu üç zorlukta oynanır.
export const DIFFICULTIES = ['easy', 'medium', 'hard'];

export const AREAS = {
  general: {
    topics: ['history', 'geography', 'science', 'math', 'literature', 'general'],
  },
  software: {
    topics: ['basics', 'algorithms', 'html-css', 'python', 'javascript', 'sql', 'git', 'security', 'csharp'],
  },
};

/** Alandaki konular ("Karışık" hariç). */
export function topicsFor(area) {
  return AREAS[area].topics;
}

/** Konunun alanı; bilinmeyen konuda null. */
export function areaOf(topic) {
  return Object.keys(AREAS).find((area) => AREAS[area].topics.includes(topic)) ?? null;
}

// İlk sürümün okul seviyeleri. Her konu kendi seviye aralığında soruluyordu; zorluk o aralığa göre verilir
// (soru bankası da aynı kuralla taşındı): 5 seviye → K, K, O, Z, Z; 4 seviye → K, O, Z, Z; 3 seviye → K, O, Z.
// Eski adresleri yönlendirmek ve tarayıcıda kayıtlı ilerlemeyi taşımak için kullanılır.
export const OLD_LEVELS = ['primary', 'middle', 'high', 'university', 'masters'];
const OLD_RANGES = {
  basics: [0, 2],
  algorithms: [1, 4],
  'html-css': [1, 4],
  python: [1, 4],
  javascript: [2, 4],
  sql: [2, 4],
  git: [2, 4],
  security: [2, 4],
  csharp: [2, 4],
};
const SPREAD = {
  5: ['easy', 'easy', 'medium', 'hard', 'hard'],
  4: ['easy', 'medium', 'hard', 'hard'],
  3: ['easy', 'medium', 'hard'],
};

/** Eski seviyenin bu konudaki zorluğu; konu o seviyede sorulmuyorduysa null. "Karışık" genel aralığı kullanır. */
export function difficultyFromLevel(topic, level) {
  const [from, to] = OLD_RANGES[topic] ?? [0, 4];
  const index = OLD_LEVELS.indexOf(level);
  if (index < from || index > to) return null;
  return SPREAD[to - from + 1][index - from];
}

// Seçim geçerli mi: alan ve zorluk var mı, konu o alanda mı ("Karışık" her alanda var).
export function isValidSelection({ area, topic, difficulty }) {
  if (!Object.hasOwn(AREAS, area) || !DIFFICULTIES.includes(difficulty)) return false;
  return topic === MIXED || topicsFor(area).includes(topic);
}
