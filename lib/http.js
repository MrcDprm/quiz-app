// API uçlarının ortak işleri: JSON yanıt, gövde doğrulama, aynı kaynak kontrolü,
// rate limit ve kullanıcıya ayrıntı sızdırmayan hata yanıtları.

export const RATE_LIMIT = 60;
export const RATE_WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 4096;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// Kullanıcı sadece kısa bir hata kodu görür; ayrıntı sunucu logunda kalır.
export function fail(status, code) {
  return json({ error: code }, status);
}

// Tarayıcı POST isteğinde Origin başlığını kendisi ekler ve sayfa bunu değiştiremez.
export function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Vercel bu başlığı kendisi yazar; ilk adres gerçek istemcidir.
export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0].trim() || 'unknown';
}

export async function isRateLimited(store, request) {
  const count = await store.hit(`rl:${clientIp(request)}`, RATE_WINDOW_MS);
  return count > RATE_LIMIT;
}

// Sadece küçük, JSON nesnesi olan gövdeler kabul edilir; aksi hâlde null.
export async function readJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// schema: { alan: doğrulayıcı }. Sadece şemadaki alanlar alınır; biri eksik ya da geçersizse null.
export function pick(body, schema) {
  const result = {};
  for (const [field, isValid] of Object.entries(schema)) {
    if (!Object.hasOwn(body, field) || !isValid(body[field])) return null;
    result[field] = body[field];
  }
  return result;
}

export const oneOf = (...values) => (value) => values.includes(value);

// Her API ucunu sarar: aynı kaynak, rate limit ve beklenmeyen hatalar tek yerde.
export function endpoint(handler, { getStore, checkOrigin = true }) {
  return async (request) => {
    try {
      if (checkOrigin && !isSameOrigin(request)) return fail(403, 'forbidden');
      const store = getStore();
      if (await isRateLimited(store, request)) return fail(429, 'rate_limited');
      return await handler(request, store);
    } catch (error) {
      console.error(error);
      return fail(500, 'server_error');
    }
  };
}