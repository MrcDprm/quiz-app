// Sayfa adresleri (/, /matematik, /matematik/ortaokul …) ve sitemap.xml bu fonksiyondan gelir (bkz. vercel.json rewrites).
// Şablon data/app.html: public/ dışında durduğu için doğrudan sunulmaz; <head> bölümü her adres için doldurulur.
import { readFile } from 'node:fs/promises';
import { renderPage, renderSitemap } from '../lib/page-seo.js';

const CACHE = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
const SEGMENT = /^[a-z0-9-]{1,40}$/;
let template;

async function respond(request) {
  const params = new URL(request.url).searchParams;
  if (params.get('sitemap') === '1') {
    return new Response(renderSitemap(), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': CACHE },
    });
  }

  template ??= await readFile(new URL('../data/app.html', import.meta.url), 'utf8');
  const topic = (params.get('topic') ?? '').toLowerCase();
  const level = (params.get('level') ?? '').toLowerCase();
  const lang = params.get('lang') === 'en' ? 'en' : 'tr';
  // Sadece harf, rakam ve tire kabul edilir; geri kalan her şey bilinmeyen adres sayılır
  let pathname = '/';
  if (topic) pathname = SEGMENT.test(topic) && (!level || SEGMENT.test(level)) ? `/${topic}${level ? `/${level}` : ''}` : '/-';
  const { status, html } = renderPage(template, pathname, lang);
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': CACHE },
  });
}

const FALLBACK = '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Bilgi Yarışması</title>'
  + '<p style="font-family:system-ui;padding:2rem">Geçici bir sorun oluştu, birkaç dakika sonra tekrar dene. · A temporary problem occurred, please try again in a few minutes.</p>';

/**
 * Sayfa kurulurken beklenmedik bir hata olursa site kapanmasın: şablon okunabildiyse olduğu gibi
 * (SEO eki olmadan, dizine eklenmeyen hâliyle) sunulur, okunamadıysa kısa bir hata sayfası gösterilir.
 * Hatanın ayrıntısı kullanıcıya değil, sunucu loguna yazılır.
 */
export async function GET(request) {
  try {
    return await respond(request);
  } catch (error) {
    console.error('Page render failed:', error);
    return new Response(template ?? FALLBACK, {
      status: template ? 200 : 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
