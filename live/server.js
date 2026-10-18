// Birlikte oynama sunucusu: odaları bellekte tutar, durumu Server-Sent Events ile telefonlara akıtır,
// cevapları ve moderatör komutlarını normal POST istekleriyle alır. Node'un yerleşik http modülü yeter; paket yok.
// Canlıda Caddy'nin arkasında (127.0.0.1) çalışır: node live/server.js
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRooms } from './rooms.js';
import { createQuestionLoader } from './questions.js';
import { isValidSelection, LANGS } from '../public/src/topics.js';

const MAX_BODY = 4096;
const MAX_STREAMS = 600;
const HEARTBEAT_MS = 25_000;
const TICK_MS = 250;
const MINUTE = 60_000;

// İp başına sınırlar: { anahtar: [istek sayısı, pencere] }
export const LIMITS = {
  create: [10, 60 * MINUTE],
  join: [30, MINUTE],
  action: [240, MINUTE],
  events: [60, MINUTE],
};

const ROUTE = /^\/rooms\/(\d{6})\/(join|answer|command|events)$/;

function createLimiter(now) {
  const hits = new Map();
  return (key, [limit, windowMs]) => {
    const entry = hits.get(key);
    if (!entry || now() - entry.start > windowMs) {
      hits.set(key, { start: now(), count: 1 });
      if (hits.size > 10_000) for (const [k, v] of hits) if (now() - v.start > 60 * MINUTE) hits.delete(k);
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

/**
 * origins: izin verilen sitelerin tam adresleri (asla '*').
 * Sadece Caddy'den (127.0.0.1) gelen istekte X-Forwarded-For'a güvenilir; diğerlerinde bağlantının adresi kullanılır.
 */
export function createLiveServer({ origins, loadQuestions = createQuestionLoader(), now = Date.now } = {}) {
  const streams = new Map(); // oda kodu → Set<{ res, token }>
  const limited = createLimiter(now);

  const rooms = createRooms({
    now,
    randomBytes,
    loadQuestions,
    onChange: (room) => broadcast(room),
  });

  function broadcast(room) {
    const set = streams.get(room.code);
    if (!set) return;
    if (!rooms.rooms.has(room.code)) {
      for (const stream of set) stream.res.end();
      streams.delete(room.code);
      return;
    }
    for (const stream of set) {
      const found = rooms.find(room.code, stream.token);
      // Çıkarılan oyuncunun akışı kapanır; tarayıcı "odadan çıkarıldın" gösterir
      if (found.error) {
        stream.res.write(`event: gone\ndata: {}\n\n`);
        stream.res.end();
        set.delete(stream);
        continue;
      }
      stream.res.write(`data: ${JSON.stringify(rooms.view(found.room, found.role, found.player))}\n\n`);
    }
  }

  const ipOf = (req) => {
    const remote = req.socket.remoteAddress ?? '';
    const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    return (local && req.headers['x-forwarded-for']?.split(',')[0].trim()) || remote;
  };

  function headers(origin, extra = {}) {
    return {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    };
  }

  function send(res, origin, status, body) {
    res.writeHead(status, headers(origin, { 'Content-Type': 'application/json; charset=utf-8' }));
    res.end(JSON.stringify(body));
  }

  async function readBody(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) return null;
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) return null;
      chunks.push(chunk);
    }
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    } catch {
      return null;
    }
  }

  function openStream(req, res, origin, code, token) {
    const found = rooms.find(code, token);
    if (found.error) return send(res, origin, 404, { error: found.error });
    const total = [...streams.values()].reduce((sum, set) => sum + set.size, 0);
    if (total >= MAX_STREAMS) return send(res, origin, 503, { error: 'busy' });
    res.writeHead(200, headers(origin, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }));
    // Bağlantı kopunca tarayıcı 2 sn sonra yeniden bağlanır ve tam durumu yeniden alır
    res.write(`retry: 2000\ndata: ${JSON.stringify(rooms.view(found.room, found.role, found.player))}\n\n`);
    const stream = { res, token };
    if (!streams.has(code)) streams.set(code, new Set());
    streams.get(code).add(stream);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(heartbeat);
      streams.get(code)?.delete(stream);
      if (streams.get(code)?.size === 0) streams.delete(code);
    });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }
    const origin = req.headers.origin;
    if (!origin || !origins.includes(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end('{"error":"forbidden"}');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers(origin, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' }));
      return res.end();
    }
    const ip = ipOf(req);

    if (req.method === 'POST' && url.pathname === '/rooms') {
      if (!limited(`create:${ip}`, LIMITS.create)) return send(res, origin, 429, { error: 'rate_limited' });
      const body = await readBody(req);
      if (!body) return send(res, origin, 400, { error: 'bad_request' });
      const { area, topic, difficulty, lang, settings, name } = body;
      if (!isValidSelection({ area, topic, difficulty }) || !LANGS.includes(lang)) return send(res, origin, 400, { error: 'bad_request' });
      const created = await rooms.create({ area, topic, difficulty, lang }, settings, name);
      if (created.error) return send(res, origin, created.error === 'busy' ? 503 : 400, { error: created.error });
      return send(res, origin, 201, { code: created.room.code, token: created.token });
    }

    const match = ROUTE.exec(url.pathname);
    if (!match) return send(res, origin, 404, { error: 'not_found' });
    const [, code, action] = match;

    if (action === 'events' && req.method === 'GET') {
      if (!limited(`events:${ip}`, LIMITS.events)) return send(res, origin, 429, { error: 'rate_limited' });
      return openStream(req, res, origin, code, url.searchParams.get('token') ?? '');
    }
    if (req.method !== 'POST') return send(res, origin, 405, { error: 'bad_request' });

    const kind = action === 'join' ? 'join' : 'action';
    if (!limited(`${kind}:${ip}`, LIMITS[kind])) return send(res, origin, 429, { error: 'rate_limited' });
    const body = await readBody(req);
    if (!body) return send(res, origin, 400, { error: 'bad_request' });

    let result;
    if (action === 'join') result = rooms.join(code, body.name);
    else if (action === 'answer') result = rooms.answer(code, String(body.token ?? ''), body.choice);
    else result = rooms.command(code, String(body.token ?? ''), body.action, body.target);

    if (result.error) return send(res, origin, result.error === 'not_found' ? 404 : result.error === 'forbidden' ? 403 : 400, { error: result.error });
    return send(res, origin, 200, action === 'join' ? { token: result.token } : { ok: true });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      // Ayrıntı sadece sunucu loguna; kullanıcı genel bir hata kodu görür
      console.error('live server error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"error":"server_error"}');
      }
    });
  });
  const ticker = setInterval(() => rooms.tick(), TICK_MS);

  /** Açık olay akışlarını bitirip sunucuyu kapatır (yoksa açık bağlantılar kapanmayı sonsuza kadar bekletir). */
  function close(callback) {
    clearInterval(ticker);
    for (const set of streams.values()) for (const stream of set) stream.res.end();
    streams.clear();
    server.close(callback);
  }
  return { server, rooms, close };
}

// Doğrudan çalıştırılınca dinlemeye başlar. LIVE_ORIGINS: virgülle ayrılmış izinli siteler.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.loadEnvFile(new URL('../.env', import.meta.url));
  } catch {
    // .env yoksa ortam değişkenleri kullanılır (sunucuda systemd verir)
  }
  const origins = (process.env.LIVE_ORIGINS ?? 'https://quiz.miracdeprem.com').split(',').map((item) => item.trim()).filter(Boolean);
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST ?? '127.0.0.1';
  const live = createLiveServer({ origins });
  live.server.listen(port, host, () => console.log(`Live server on http://${host}:${port} for ${origins.join(', ')}`));
  // systemd durdururken bağlantılar düzgün kapansın
  process.on('SIGTERM', () => live.close(() => process.exit(0)));
}
