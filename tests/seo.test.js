// Adresler (routes.js), <head> üretimi (seo-head.js) ve sayfa fonksiyonu (api/page.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, isValidSelection } from '../public/src/topics.js';
import { DIFFICULTY_SLUGS, legacyRedirect, pageMeta, pathFor, routeFromPath, SITEMAP_PATHS, TOPIC_SLUGS } from '../public/src/routes.js';
import { buildHead } from '../lib/seo-head.js';
import { renderPage } from '../lib/page-seo.js';
import { GET } from '../api/page.js';

const TEMPLATE = '<!doctype html>\n<html lang="tr">\n  <head>\n    <!-- seo -->\n    <title>x</title>\n    <!-- /seo -->\n  </head>\n  <body>gövde</body>\n</html>';

test('every topic of every area has a unique address', () => {
  const topics = Object.values(AREAS).flatMap((area) => area.topics);
  assert.deepEqual(Object.keys(TOPIC_SLUGS).sort(), [...topics].sort());
  assert.equal(new Set(Object.values(TOPIC_SLUGS)).size, topics.length);
  assert.ok([...Object.values(TOPIC_SLUGS), ...Object.values(DIFFICULTY_SLUGS)].every((slug) => /^[a-z0-9-]+$/.test(slug)));
});

test('sitemap: home, 17 topics and every topic at 3 difficulties', () => {
  assert.equal(SITEMAP_PATHS.length, 2 + 17 + 17 * 3); // ana sayfa, /oda, konular ve zorluklar
  assert.equal(new Set(SITEMAP_PATHS).size, SITEMAP_PATHS.length);
  for (const path of SITEMAP_PATHS.filter((item) => item !== '/' && item !== '/oda')) {
    const route = routeFromPath(path);
    assert.ok(route, path);
    if (route.difficulty) assert.ok(isValidSelection(route), path);
    assert.equal(pathFor(route), path);
  }
});

test('addresses map to selections', () => {
  assert.deepEqual(routeFromPath('/matematik/kolay'), { area: 'general', topic: 'math', difficulty: 'easy' });
  assert.deepEqual(routeFromPath('/Web-Guvenligi/'), { area: 'software', topic: 'security', difficulty: null });
  assert.equal(routeFromPath('/matematik/ortaokul'), null); // eski seviye adresi: yönlendirilir, sayfa değil
  assert.equal(routeFromPath('/matematik/kolay/fazla'), null);
  assert.equal(routeFromPath('/constructor'), null);
  assert.equal(pathFor({ topic: 'mixed', difficulty: 'medium' }), '/');
});

test('old school level addresses redirect to the difficulty of that topic', () => {
  assert.equal(legacyRedirect('/tarih/ortaokul'), '/tarih/kolay');
  assert.equal(legacyRedirect('/tarih/lise'), '/tarih/orta');
  assert.equal(legacyRedirect('/tarih/yuksek-lisans'), '/tarih/zor');
  assert.equal(legacyRedirect('/javascript/lise'), '/javascript/kolay'); // JavaScript liseden başlıyordu
  assert.equal(legacyRedirect('/javascript/ilkokul'), '/javascript'); // hiç yoktu: konunun sayfasına
  assert.equal(legacyRedirect('/tarih/kolay'), null);
  assert.equal(legacyRedirect('/yok/lise'), null);
});

test('page titles in both languages', () => {
  assert.equal(pageMeta({ topic: 'math', difficulty: 'easy' }, 'tr').title, 'Kolay Matematik Soruları – Online Test');
  assert.equal(pageMeta({ topic: 'python', difficulty: 'medium' }, 'en').title, 'Python Quiz – Medium');
  assert.equal(pageMeta({ topic: 'general', difficulty: null }, 'tr').title, 'Genel Kültür Soruları – Kolaydan Zora Online Test');
  for (const lang of ['tr', 'en']) assert.ok(pageMeta(null, lang).description.length <= 165);
});

test('JSON-LD cannot break out of its script tag', () => {
  const head = buildHead({
    origin: 'https://example.com', path: '/', lang: 'tr', title: 't', description: 'd', siteName: 's', image: 'i',
    schemas: [{ name: '</script><script>alert(1)</script>' }],
  });
  assert.ok(!head.includes('</script><script>'));
});

test('topic + difficulty page: learning resource with difficulty and breadcrumb', () => {
  const { status, html } = renderPage(TEMPLATE, '/tarih/orta', 'tr');
  assert.equal(status, 200);
  assert.match(html, /<link rel="canonical" href="https:\/\/quiz\.miracdeprem\.com\/tarih\/orta" \/>/);
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(schemas[0].learningResourceType, 'Quiz');
  assert.equal(schemas[0].educationalLevel, 'Orta');
  assert.deepEqual(schemas[1].itemListElement.map((item) => item.name), ['Bilgi Yarışması', 'Tarih', 'Orta']);
});

test('page function: home, unknown combination and sitemap', async () => {
  const home = await GET(new Request('https://x/api/page?lang=en'));
  assert.match(await home.text(), /EducationalApplication/);
  const wrong = await GET(new Request('https://x/api/page?topic=javascript&difficulty=uzman'));
  assert.equal(wrong.status, 404);
  const moved = await GET(new Request('https://x/api/page?topic=tarih&difficulty=lise&lang=en'));
  assert.equal(moved.status, 308);
  assert.equal(moved.headers.get('location'), '/tarih/orta?lang=en');
  const odd = await GET(new Request('https://x/api/page?topic=%3Cscript%3E'));
  assert.equal(odd.status, 404);
  const sitemap = await (await GET(new Request('https://x/api/page?sitemap=1'))).text();
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 2 * (2 + 17 + 17 * 3));
});

test('the play-with-friends page is indexed, a room address is not', async () => {
  const room = renderPage(TEMPLATE, '/oda', 'tr');
  assert.equal(room.status, 200);
  assert.match(room.html, /Arkadaşlarınla Bilgi Yarışması/);
  assert.ok(room.html.includes('<link rel="canonical" href="https://quiz.miracdeprem.com/oda" />'));
  assert.doesNotMatch(room.html, /noindex/);
  const code = renderPage(TEMPLATE, '/oda/482913', 'en');
  assert.equal(code.status, 200);
  assert.match(code.html, /noindex/);
  assert.match(code.html, /Multiplayer Quiz with Friends/);
  assert.equal((await GET(new Request('https://x/api/page?room=482913'))).status, 200);
  assert.equal((await GET(new Request('https://x/api/page?room=1'))).status, 200);
  assert.equal((await GET(new Request('https://x/api/page?room=%3Cx%3E'))).status, 404);
});
