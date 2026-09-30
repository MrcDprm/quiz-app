// Yerel geliştirme sunucusu: public/ klasörünü sunar, /api/* isteklerini Vercel'deki aynı fonksiyonlara
// yönlendirir ve vercel.json'daki "rewrites" kurallarını uygular (/matematik/ortaokul → api/page.js).
// Sadece geliştirme içindir.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname, join, resolve, sep } from 'node:path';

const PORT = Number(process.env.PORT) || 5173;
const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC_DIR = join(ROOT, 'public');
const API_NAMES = ['round', 'daily', 'review', 'answer', 'joker', 'page'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// .env dosyası varsa ortam değişkenlerine yüklenir (Node 20.12+).
try {
  process.loadEnvFile(join(ROOT, '.env'));
} catch {
  console.warn('No .env file found; copy .env.example to .env first.');
}

// vercel.json'daki "/:topic(a|b)/:level(c|d)" gibi kaynak kalıpları düzenli ifadeye çevrilir.
const vercel = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
const rewrites = (vercel.rewrites ?? []).map((rule) => ({
  ...rule,
  regex: new RegExp(`^${rule.source.replace(/:(\w+)(\(([^)]+)\))?/g, (m, name, group, re) => `(?<${name}>${re ?? '[^/]+'})`)}$`),
}));

/** Vercel gibi: kural eşleşirse hedef adres; istekteki sorgu parametreleri (?lang=en) korunur. */
function rewriteTarget(pathname, search) {
  for (const rule of rewrites) {
    const match = pathname.match(rule.regex);
    if (!match) continue;
    const target = new URL(rule.destination.replace(/:(\w+)/g, (m, name) => match.groups?.[name] ?? ''), 'http://localhost');
    for (const [key, value] of new URLSearchParams(search)) if (!target.searchParams.has(key)) target.searchParams.set(key, value);
    return target;
  }
  return null;
}

// Node'un isteğini Vercel'in kullandığı Web Request nesnesine çevirir.
function toWebRequest(req) {
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  return new Request(new URL(req.url, `http://${req.headers.host}`), {
    method: req.method,
    headers: req.headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: 'half',
  });
}

async function sendResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function handleApi(req, res, name) {
  if (!API_NAMES.includes(name)) return sendResponse(res, new Response('Not found', { status: 404 }));
  const module = await import(`../api/${name}.js`);
  const handler = module[req.method];
  if (!handler) return sendResponse(res, new Response('Method not allowed', { status: 405 }));
  return sendResponse(res, await handler(toWebRequest(req)));
}

// Dosya yolu public/ dışına çıkamaz (../ ile gezinme engellenir).
async function handleStatic(res, pathname) {
  const target = resolve(PUBLIC_DIR, `.${decodeURIComponent(pathname)}`);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + sep)) {
    return sendResponse(res, new Response('Forbidden', { status: 403 }));
  }
  try {
    const file = (await stat(target)).isDirectory() ? join(target, 'index.html') : target;
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    return sendResponse(res, new Response('Not found', { status: 404 }));
  }
}

createServer(async (req, res) => {
  try {
    const { pathname, search } = new URL(req.url, 'http://localhost');
    const match = pathname.match(/^\/api\/([a-z]+)$/);
    if (match) return await handleApi(req, res, match[1]);
    // Sayfa adresleri (/, /matematik …) ve sitemap.xml sayfa fonksiyonundan gelir
    const target = req.method === 'GET' ? rewriteTarget(pathname, search) : null;
    if (target) {
      const { GET } = await import('../api/page.js');
      return sendResponse(res, await GET(new Request(target)));
    }
    await handleStatic(res, pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(PORT, () => {
  console.log(`Quiz App: http://localhost:${PORT}`);
});