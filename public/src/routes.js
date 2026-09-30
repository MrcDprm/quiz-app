// Uygulamanın adresleri: her konu ve konu + seviye kendi sayfasına sahip (/matematik, /matematik/ortaokul …).
// Hem tarayıcı (main.js) hem sunucu fonksiyonu (api/page.js) kullanır; başlıklar iki tarafta aynı olur.
import { AREAS, LEVELS, topicsFor } from './topics.js';
import { translate } from './i18n.js';

export const ORIGIN = 'https://quiz.miracdeprem.com';

export const TOPIC_SLUGS = {
  math: 'matematik',
  science: 'fen-bilimleri',
  history: 'tarih',
  geography: 'cografya',
  literature: 'edebiyat-ve-sanat',
  general: 'genel-kultur',
  basics: 'kodlamaya-giris',
  algorithms: 'algoritmalar',
  'html-css': 'html-css',
  python: 'python',
  javascript: 'javascript',
  sql: 'sql',
  git: 'git',
  security: 'web-guvenligi',
  csharp: 'csharp',
};

export const LEVEL_SLUGS = {
  primary: 'ilkokul',
  middle: 'ortaokul',
  high: 'lise',
  university: 'universite',
  masters: 'yuksek-lisans',
};

const invert = (map) => Object.fromEntries(Object.entries(map).map(([id, slug]) => [slug, id]));
const TOPIC_BY_SLUG = invert(TOPIC_SLUGS);
const LEVEL_BY_SLUG = invert(LEVEL_SLUGS);

/** Konunun alanı ve sorulduğu seviyeler. */
function topicInfo(topic) {
  const area = Object.keys(AREAS).find((name) => AREAS[name].topics.includes(topic));
  return { area, levels: LEVELS.filter((level) => topicsFor(area, level).includes(topic)) };
}

/**
 * "/matematik/ortaokul" → { area, topic, level }; "/matematik" → level null.
 * Adresi olmayan ya da o seviyede sorulmayan konu için null.
 */
export function routeFromPath(pathname) {
  const [topicSlug, levelSlug, extra] = pathname.replace(/^\/+|\/+$/g, '').toLowerCase().split('/');
  const topic = Object.hasOwn(TOPIC_BY_SLUG, topicSlug ?? '') ? TOPIC_BY_SLUG[topicSlug] : null;
  if (!topic || extra !== undefined) return null;
  const { area, levels } = topicInfo(topic);
  if (levelSlug === undefined) return { area, topic, level: null };
  const level = Object.hasOwn(LEVEL_BY_SLUG, levelSlug) ? LEVEL_BY_SLUG[levelSlug] : null;
  return level && levels.includes(level) ? { area, topic, level } : null;
}

/** Seçimin adresi: konu + seviye; "Karışık" gibi adresi olmayan seçimde ana adres. */
export function pathFor(route) {
  if (!route || !Object.hasOwn(TOPIC_SLUGS, route.topic)) return '/';
  return route.level ? `/${TOPIC_SLUGS[route.topic]}/${LEVEL_SLUGS[route.level]}` : `/${TOPIC_SLUGS[route.topic]}`;
}

/** Bütün sayfalar: ana sayfa, her konu ve konunun sorulduğu her seviye. */
export const SITEMAP_PATHS = [
  '/',
  ...Object.keys(TOPIC_SLUGS).flatMap((topic) => {
    const { levels } = topicInfo(topic);
    return [pathFor({ topic, level: null }), ...levels.map((level) => pathFor({ topic, level }))];
  }),
];

const HOME = {
  tr: {
    title: 'Bilgi Yarışması – Online Quiz, Genel Kültür ve Yazılım Soruları | Miraç Deprem',
    description:
      'Ücretsiz bilgi yarışması: ilkokuldan yüksek lisansa matematik, fen, tarih, coğrafya, genel kültür ve yazılım soruları. Günün sorusu ve rozetlerle bilgini ölç.',
  },
  en: {
    title: 'Quiz App – Online Trivia, General Knowledge and Coding Quizzes | Miraç Deprem',
    description:
      'Free online quiz: maths, science, history, geography, general knowledge and coding questions from primary school to master’s level, plus a daily question.',
  },
};

/** Sekme başlığı ve açıklama. route boşsa ana sayfa metni döner. */
export function pageMeta(route, lang) {
  if (!route) return HOME[lang];
  const topic = translate(lang, `topic_${route.topic}`);
  if (lang === 'en') {
    if (!route.level) {
      return {
        title: `${topic} Quiz – Free Online Test by Level`,
        description: `${topic} questions for your level: a free 10-question online quiz with a timer, points and an explanation after every answer. No sign-up.`,
      };
    }
    const level = translate(lang, `level_${route.level}`);
    return {
      title: `${topic} Quiz – ${level} Level`,
      description: `${level} level ${topic} questions: a free 10-question online quiz with a timer, points and an explanation after every answer. No sign-up.`,
    };
  }
  const lower = topic.toLocaleLowerCase('tr');
  if (!route.level) {
    return {
      title: `${topic} Soruları – Seviyene Göre Online Test`,
      description: `Seviyene göre ${lower} soruları: süreli, puanlı ve her sorudan sonra açıklamalı cevaplı 10 soruluk ücretsiz online test. Üyelik gerekmez.`,
    };
  }
  const level = translate(lang, `level_${route.level}`);
  return {
    title: `${level} ${topic} Soruları – Online Test`,
    description: `${level} seviyesinde ${lower} soruları: süreli, puanlı ve her sorudan sonra açıklamalı cevaplı 10 soruluk ücretsiz online test. Üyelik gerekmez.`,
  };
}
