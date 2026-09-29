// Alan, konu ve seviye listeleri. Sunucu doğrulamada, arayüz açılır listelerde kullanır.

export const LANGS = ['tr', 'en'];
export const MIXED = 'mixed';

export const AREAS = {
  general: {
    levels: ['primary', 'middle', 'high', 'university', 'masters'],
    topics: ['math', 'science', 'history', 'geography', 'literature', 'general'],
  },
  software: {
    levels: ['beginner', 'intermediate', 'advanced'],
    topics: ['javascript', 'python', 'sql', 'git', 'html-css', 'security', 'algorithms', 'csharp'],
  },
};

export const ALL_LEVELS = Object.values(AREAS).flatMap((area) => area.levels);

// Seçim geçerli mi: alan var mı, konu ve seviye o alana ait mi. Karışık tur sadece genel alanda.
export function isValidSelection({ area, topic, level }) {
  if (!Object.hasOwn(AREAS, area)) return false;
  const { topics, levels } = AREAS[area];
  const topicOk = topics.includes(topic) || (area === 'general' && topic === MIXED);
  return topicOk && levels.includes(level);
}