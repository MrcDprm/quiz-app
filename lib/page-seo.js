// Her adres için sayfa HTML'i: şablona o sayfanın başlığı, açıklaması ve yapılandırılmış verisi eklenir.
import { buildHead, buildSitemap, injectHead, localeUrls } from './seo-head.js';
import { translate } from '../public/src/i18n.js';
import { ORIGIN, pageMeta, pathFor, routeFromPath, SITEMAP_PATHS } from '../public/src/routes.js';

// Birlikte oynama sayfası. Kodlu oda adresleri (/oda/482913) geçicidir: açılır ama dizine eklenmez.
const ROOM_PATH = /^\/oda(?:\/(\d{6}))?$/;
const ROOM_META = {
  tr: {
    title: 'Arkadaşlarınla Bilgi Yarışması – Oda Kur, Kodla Katıl | Miraç Deprem',
    description: 'Ücretsiz çok oyunculu bilgi yarışması: bir oda kur, 6 haneli kodu paylaş; herkes aynı soruyu aynı anda kendi telefonunda cevaplasın. Üyelik gerekmez.',
  },
  en: {
    title: 'Multiplayer Quiz with Friends – Create a Room, Join with a Code | Miraç Deprem',
    description: 'Free multiplayer quiz: create a room, share the 6-digit code and everyone answers the same question at the same time on their own phone. No sign-up.',
  },
};

const SITE_NAME = { tr: 'Bilgi Yarışması', en: 'Quiz App' };
const IMAGE = `${ORIGIN}/og-image.png`;
const APP_ID = `${ORIGIN}/#app`;
const AUTHOR = { '@type': 'Person', name: 'Miraç Deprem', url: 'https://www.miracdeprem.com' };

function appSchema(lang) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': APP_ID,
    name: SITE_NAME[lang],
    alternateName: SITE_NAME[lang === 'en' ? 'tr' : 'en'],
    url: `${ORIGIN}/`,
    description: pageMeta(null, lang).description,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'TRY' },
    isAccessibleForFree: true,
    inLanguage: ['tr', 'en'],
    screenshot: IMAGE,
    author: AUTHOR,
    sameAs: ['https://github.com/MrcDprm/quiz-app', 'https://www.miracdeprem.com/projects/bilgi-yarismasi'],
  };
}

function quizSchemas(route, path, lang, meta) {
  const { tr, en } = localeUrls(ORIGIN, path);
  const url = lang === 'en' ? en : tr;
  const topicName = translate(lang, `topic_${route.topic}`);
  const home = lang === 'en' ? `${ORIGIN}/?lang=en` : `${ORIGIN}/`;
  const topicPath = pathFor({ topic: route.topic, difficulty: null });
  const crumbs = [
    { name: SITE_NAME[lang], item: home },
    { name: topicName, item: lang === 'en' ? localeUrls(ORIGIN, topicPath).en : localeUrls(ORIGIN, topicPath).tr },
  ];
  if (route.difficulty) crumbs.push({ name: translate(lang, `difficulty_${route.difficulty}`), item: url });
  return [
    {
      '@context': 'https://schema.org',
      '@type': ['WebPage', 'LearningResource'],
      name: meta.title,
      description: meta.description,
      url,
      inLanguage: lang === 'en' ? 'en-US' : 'tr-TR',
      isPartOf: { '@id': APP_ID },
      learningResourceType: 'Quiz',
      isAccessibleForFree: true,
      about: { '@type': 'Thing', name: topicName },
      ...(route.difficulty && { educationalLevel: translate(lang, `difficulty_${route.difficulty}`) }),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, ...crumb })),
    },
  ];
}

/**
 * İstenen adresin HTML'i ve durum kodu. Yol "/" ise ana sayfa; bilinmeyen adreste uygulama yine açılır
 * ama 404 döner ve dizine eklenmez (adres metni sayfaya hiç yazılmaz).
 */
export function renderPage(template, pathname, lang) {
  const room = ROOM_PATH.exec(pathname);
  if (room) {
    const head = buildHead({
      origin: ORIGIN,
      path: '/oda',
      lang,
      ...ROOM_META[lang],
      siteName: SITE_NAME[lang],
      image: IMAGE,
      schemas: [appSchema(lang)],
      index: !room[1],
    });
    return { status: 200, html: injectHead(template, head, lang) };
  }
  const route = pathname === '/' ? null : routeFromPath(pathname);
  const known = pathname === '/' || Boolean(route);
  const path = pathFor(route);
  const meta = pageMeta(route, lang);
  const head = buildHead({
    origin: ORIGIN,
    path,
    lang,
    ...meta,
    siteName: SITE_NAME[lang],
    image: IMAGE,
    schemas: route ? quizSchemas(route, path, lang, meta) : [appSchema(lang)],
    index: known,
  });
  return { status: known ? 200 : 404, html: injectHead(template, head, lang) };
}

export const renderSitemap = () => buildSitemap(ORIGIN, SITEMAP_PATHS);
