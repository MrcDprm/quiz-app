// Adresler (routes.js), <head> üretimi (seo-head.js) ve sayfa fonksiyonu (api/page.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, isValidSelection } from '../public/src/topics.js';
import { LEVEL_SLUGS, pageMeta, pathFor, routeFromPath, SITEMAP_PATHS, TOPIC_SLUGS } from '../public/src/routes.js';
import { buildHead } from '../lib/seo-head.js';
import { renderPage } from '../lib/page-seo.js';
import { GET } from '../api/page.js';

const TEMPLATE = '<!doctype html>\n<html lang="tr">\n  <head>\n    <!-- seo -->\n    <title>x</title>\n    <!-- /seo -->\n  </head>\n  <body>gövde</body>\n</html>';

test('every topic of every area has a unique address', () => {
  const topics = Object.values(AREAS).flatMap((area) => area.topics);
  assert.deepEqual(Object.keys(TOPIC_SLUGS).sort(), [...topics].sort());
  assert.equal(new Set(Object.values(TOPIC_SLUGS)).size, topics.length);
  assert.ok([...Object.values(TOPIC_SLUGS), ...Object.values(LEVEL_SLUGS)].every((slug) => /^[a-z0-9-]+$/.test(slug)));
});

test('sitemap: home, 15 topics and every level a topic is asked at', () => {
  assert.equal(SITEMAP_PATHS.length, 76);
  assert.equal(new Set(SITEMAP_PATHS).size, SITEMAP_PATHS.length);
  for (const path of SITEMAP_PATHS.slice(1)) {
    const route = routeFromPath(path);
    assert.ok(route, path);
    if (route.level) assert.ok(isValidSelection(route), path);
    assert.equal(pathFor(route), path);
  }
});

test('addresses map to selections', () => {
  assert.deepEqual(routeFromPath('/matematik/ortaokul'), { area: 'general', topic: 'math', level: 'middle' });
  assert.deepEqual(routeFromPath('/Web-Guvenligi/'), { area: 'software', topic: 'security', level: null });
  assert.equal(routeFromPath('/javascript/ilkokul'), null); // JavaScript ilkokulda sorulmuyor
  assert.equal(routeFromPath('/matematik/ortaokul/fazla'), null);
  assert.equal(routeFromPath('/constructor'), null);
  assert.equal(pathFor({ topic: 'mixed', level: 'high' }), '/');
});

test('page titles in both languages', () => {
  assert.equal(pageMeta({ topic: 'math', level: 'middle' }, 'tr').title, 'Ortaokul Matematik Soruları – Online Test');
  assert.equal(pageMeta({ topic: 'python', level: 'high' }, 'en').title, 'Python Quiz – High School Level');
  assert.equal(pageMeta({ topic: 'general', level: null }, 'tr').title, 'Genel Kültür Soruları – Seviyene Göre Online Test');
  for (const lang of ['tr', 'en']) assert.ok(pageMeta(null, lang).description.length <= 165);
});

test('JSON-LD cannot break out of its script tag', () => {
  const head = buildHead({
    origin: 'https://example.com', path: '/', lang: 'tr', title: 't', description: 'd', siteName: 's', image: 'i',
    schemas: [{ name: '</script><script>alert(1)</script>' }],
  });
  assert.ok(!head.includes('</script><script>'));
});

test('topic + level page: learning resource with level and breadcrumb', () => {
  const { status, html } = renderPage(TEMPLATE, '/tarih/lise', 'tr');
  assert.equal(status, 200);
  assert.match(html, /<link rel="canonical" href="https:\/\/quiz\.miracdeprem\.com\/tarih\/lise" \/>/);
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(schemas[0].learningResourceType, 'Quiz');
  assert.equal(schemas[0].educationalLevel, 'Lise');
  assert.deepEqual(schemas[1].itemListElement.map((item) => item.name), ['Bilgi Yarışması', 'Tarih', 'Lise']);
});

test('page function: home, unknown combination and sitemap', async () => {
  const home = await GET(new Request('https://x/api/page?lang=en'));
  assert.match(await home.text(), /EducationalApplication/);
  const wrong = await GET(new Request('https://x/api/page?topic=javascript&level=ilkokul'));
  assert.equal(wrong.status, 404);
  const odd = await GET(new Request('https://x/api/page?topic=%3Cscript%3E'));
  assert.equal(odd.status, 404);
  const sitemap = await (await GET(new Request('https://x/api/page?sitemap=1'))).text();
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 152);
});
