// Sayfaya özel <head> etiketleri: başlık, açıklama, kanonik adres, hreflang, Open Graph, Twitter ve JSON-LD.
// Sunucu fonksiyonu (api/page.js) HTML şablonundaki <!-- seo --> … <!-- /seo --> arasını bununla doldurur.
// Böylece JavaScript çalıştırmayan arama motorları ve paylaşım önizlemeleri de doğru bilgiyi görür.
// Saf fonksiyonlar; Node'da test edilir.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Metni HTML özniteliği ya da içeriği olarak güvenle yazılabilir hâle getirir. */
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** JSON-LD içindeki "<" kaçışlanır; metin "</script>" içerse bile etiketten çıkamaz. */
const jsonLd = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

const OG_LOCALE = { tr: 'tr_TR', en: 'en_US' };

/** Bir yolun iki dildeki adresi: Türkçe parametresiz, İngilizce ?lang=en ile. */
export function localeUrls(origin, path) {
  const tr = `${origin}${path}`;
  return { tr, en: `${tr}?lang=en` };
}

/**
 * @param {object} page
 * @param {string} page.origin    https://weather.miracdeprem.com
 * @param {string} page.path      "/" ya da "/istanbul"
 * @param {'tr'|'en'} page.lang
 * @param {string} page.title
 * @param {string} page.description
 * @param {string} page.siteName
 * @param {string} page.image     1200×630 paylaşım görselinin tam adresi
 * @param {object[]} [page.schemas] JSON-LD nesneleri
 * @param {boolean} [page.index]  false: arama motorları dizine eklemez (bilinmeyen adres)
 */
export function buildHead({ origin, path, lang, title, description, siteName, image, schemas = [], index = true }) {
  const { tr, en } = localeUrls(origin, path);
  const url = lang === 'en' ? en : tr;
  const other = lang === 'en' ? 'tr' : 'en';
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="robots" content="${index ? 'index, follow, max-image-preview:large' : 'noindex, follow'}" />`,
    `<meta name="author" content="Miraç Deprem" />`,
  ];
  if (index) {
    tags.push(
      `<link rel="canonical" href="${escapeHtml(url)}" />`,
      `<link rel="alternate" hreflang="tr" href="${escapeHtml(tr)}" />`,
      `<link rel="alternate" hreflang="en" href="${escapeHtml(en)}" />`,
      `<link rel="alternate" hreflang="x-default" href="${escapeHtml(tr)}" />`,
    );
  }
  tags.push(
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${OG_LOCALE[lang]}" />`,
    `<meta property="og:locale:alternate" content="${OG_LOCALE[other]}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    ...schemas.map((schema) => `<script type="application/ld+json">${jsonLd(schema)}</script>`),
  );
  return tags.map((tag) => `    ${tag}`).join('\n');
}

const START = '<!-- seo -->';
const END = '<!-- /seo -->';

/** Şablondaki SEO bölümünü değiştirir ve <html lang> değerini sayfanın diline ayarlar. */
export function injectHead(template, head, lang) {
  const start = template.indexOf(START);
  const end = template.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw new Error('SEO markers are missing in the template');
  return `${template.slice(0, start + START.length)}\n${head}\n    ${template.slice(end)}`.replace(
    /<html lang="[a-z]{2}">/,
    `<html lang="${lang}">`,
  );
}

/** sitemap.xml: her sayfa iki dilde, birbirini hreflang ile gösterir. */
export function buildSitemap(origin, paths) {
  const entry = (loc, { tr, en }) =>
    `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n` +
    `    <xhtml:link rel="alternate" hreflang="tr" href="${escapeHtml(tr)}" />\n` +
    `    <xhtml:link rel="alternate" hreflang="en" href="${escapeHtml(en)}" />\n` +
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(tr)}" />\n  </url>`;
  const urls = paths.flatMap((path) => {
    const pair = localeUrls(origin, path);
    return [entry(pair.tr, pair), entry(pair.en, pair)];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}
