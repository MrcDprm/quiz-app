// Uygulamanın adresleri: her konu ve konu + zorluk kendi sayfasına sahip (/tarih, /tarih/kolay …).
// Hem tarayıcı (main.js) hem sunucu fonksiyonu (api/page.js) kullanır; başlıklar iki tarafta aynı olur.
import { DIFFICULTIES, areaOf, difficultyFromLevel } from './topics.js';
import { translate } from './i18n.js';

export const ORIGIN = 'https://quiz.miracdeprem.com';

export const TOPIC_SLUGS = {
  history: 'tarih',
  geography: 'cografya',
  science: 'fen-bilimleri',
  math: 'matematik',
  literature: 'edebiyat-ve-sanat',
  sport: 'spor',
  'film-music': 'sinema-ve-muzik',
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

export const DIFFICULTY_SLUGS = { easy: 'kolay', medium: 'orta', hard: 'zor' };

const invert = (map) => Object.fromEntries(Object.entries(map).map(([id, slug]) => [slug, id]));
const TOPIC_BY_SLUG = invert(TOPIC_SLUGS);
const DIFFICULTY_BY_SLUG = invert(DIFFICULTY_SLUGS);

// İlk sürümün okul seviyesi adresleri (/tarih/ortaokul); eşleme topics.js'teki difficultyFromLevel ile.
const OLD_LEVEL_SLUGS = { ilkokul: 'primary', ortaokul: 'middle', lise: 'high', universite: 'university', 'yuksek-lisans': 'masters' };

const segments = (pathname) => pathname.replace(/^\/+|\/+$/g, '').toLowerCase().split('/');

/**
 * "/tarih/kolay" → { area, topic, difficulty }; "/tarih" → difficulty null.
 * Adresi olmayan konu ya da zorluk için null.
 */
export function routeFromPath(pathname) {
  const [topicSlug, difficultySlug, extra] = segments(pathname);
  const topic = Object.hasOwn(TOPIC_BY_SLUG, topicSlug ?? '') ? TOPIC_BY_SLUG[topicSlug] : null;
  if (!topic || extra !== undefined) return null;
  const area = areaOf(topic);
  if (difficultySlug === undefined) return { area, topic, difficulty: null };
  const difficulty = Object.hasOwn(DIFFICULTY_BY_SLUG, difficultySlug) ? DIFFICULTY_BY_SLUG[difficultySlug] : null;
  return difficulty ? { area, topic, difficulty } : null;
}

/** Eski seviye adresinin yeni karşılığı ("/tarih/ortaokul" → "/tarih/kolay"); eski adres değilse null. */
export function legacyRedirect(pathname) {
  const [topicSlug, levelSlug, extra] = segments(pathname);
  const topic = Object.hasOwn(TOPIC_BY_SLUG, topicSlug ?? '') ? TOPIC_BY_SLUG[topicSlug] : null;
  if (!topic || extra !== undefined || !Object.hasOwn(OLD_LEVEL_SLUGS, levelSlug ?? '')) return null;
  // Konu o seviyede hiç sorulmuyorduysa konunun ana adresine gider
  return pathFor({ topic, difficulty: difficultyFromLevel(topic, OLD_LEVEL_SLUGS[levelSlug]) });
}

/** Seçimin adresi: konu + zorluk; "Karışık" gibi adresi olmayan seçimde ana adres. */
export function pathFor(route) {
  if (!route || !Object.hasOwn(TOPIC_SLUGS, route.topic)) return '/';
  const base = `/${TOPIC_SLUGS[route.topic]}`;
  return route.difficulty ? `${base}/${DIFFICULTY_SLUGS[route.difficulty]}` : base;
}

/** Bütün sayfalar: ana sayfa, her konu ve konunun her zorluğu. */
export const SITEMAP_PATHS = [
  '/',
  '/oda',
  ...Object.keys(TOPIC_SLUGS).flatMap((topic) => [
    pathFor({ topic, difficulty: null }),
    ...DIFFICULTIES.map((difficulty) => pathFor({ topic, difficulty })),
  ]),
];

const HOME = {
  tr: {
    title: 'Bilgi Yarışması – Online Quiz, Genel Kültür ve Yazılım Soruları | Miraç Deprem',
    description:
      'Ücretsiz bilgi yarışması: tarih, coğrafya, fen, matematik, genel kültür ve yazılım soruları; kolay, orta ve zor. Günün sorusu ve rozetlerle bilgini ölç.',
  },
  en: {
    title: 'Quiz App – Online Trivia, General Knowledge and Coding Quizzes | Miraç Deprem',
    description:
      'Free online quiz: history, geography, science, maths, general knowledge and coding questions in easy, medium and hard, plus a daily question.',
  },
};

/** Sekme başlığı ve açıklama. route boşsa ana sayfa metni döner. */
export function pageMeta(route, lang) {
  if (!route) return HOME[lang];
  const topic = translate(lang, `topic_${route.topic}`);
  if (lang === 'en') {
    if (!route.difficulty) {
      return {
        title: `${topic} Quiz – Free Online Test, Easy to Hard`,
        description: `${topic} questions in easy, medium and hard: a free 10-question online quiz with a timer, points and an explanation after every answer. No sign-up.`,
      };
    }
    const difficulty = translate(lang, `difficulty_${route.difficulty}`);
    return {
      title: `${topic} Quiz – ${difficulty}`,
      description: `${difficulty} ${topic} questions: a free 10-question online quiz with a timer, points and an explanation after every answer. No sign-up.`,
    };
  }
  const lower = topic.toLocaleLowerCase('tr');
  if (!route.difficulty) {
    return {
      title: `${topic} Soruları – Kolaydan Zora Online Test`,
      description: `Kolay, orta ve zor ${lower} soruları: süreli, puanlı ve her sorudan sonra açıklamalı cevaplı 10 soruluk ücretsiz online test. Üyelik gerekmez.`,
    };
  }
  const difficulty = translate(lang, `difficulty_${route.difficulty}`);
  return {
    title: `${difficulty} ${topic} Soruları – Online Test`,
    description: `${difficulty} ${lower} soruları: süreli, puanlı ve her sorudan sonra açıklamalı cevaplı 10 soruluk ücretsiz online test. Üyelik gerekmez.`,
  };
}
