// API uçlarının ortak işleri: JSON yanıt, gövde doğrulama, aynı kaynak kontrolü,
// rate limit ve kullanıcıya ayrıntı sızdırmayan hata yanıtları.

export const RATE_LIMIT = 120;
export const RATE_WINDOW_MS = 60_000;
// En büyük gövde: 50 görülmüş soru kimliği (her biri en fazla 80 karakter) rahatça sığar.
const MAX_BODY_BYTES = 8192;

// Günün sorusunu kendi sayfasında gösteren portfolyo. EXTRA_ORIGINS (virgülle ayrılmış) önizleme
// adresleri içindir. Bu liste sadece cors: true verilen uçlarda (daily, answer) geçerlidir.
export const CROSS_ORIGINS = ['https://www.miracdeprem.com'];

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

function crossOrigins() {
  const extra = (process.env.EXTRA_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return [...CROSS_ORIGINS, ...extra];
}

// İzin listesindeki başka bir siteden gelen isteğin Origin değeri; değilse null.
export function allowedCrossOrigin(request) {
  const origin = request.headers.get('origin');
  return origin && crossOrigins().includes(origin) ? origin : null;
}

// Tarayıcının yanıtı okumasına izin veren başlıklar. Asla '*' değil, tam adres yazılır.
export function withCors(response, origin) {
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Vary', 'Origin');
  return response;
}

// Tarayıcının JSON POST'tan önce sorduğu OPTIONS isteği: sadece izinli siteye evet.
export function preflight(request) {
  const origin = allowedCrossOrigin(request);
  if (!origin) return new Response(null, { status: 403, headers: { Vary: 'Origin' } });
  return withCors(
    new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      },
    }),
    origin,
  );
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

// schema: { alan: doğrulayıcı }. Sadece şemadaki alanlar alınır; zorunlu alan eksikse ya da
// herhangi bir alan geçersizse null. optional(...) ile sarılan alanlar gönderilmeyebilir.
export function pick(body, schema) {
  const result = {};
  for (const [field, isValid] of Object.entries(schema)) {
    if (!Object.hasOwn(body, field)) {
      if (isValid.optional) continue;
      return null;
    }
    if (!isValid(body[field])) return null;
    result[field] = body[field];
  }
  return result;
}

export const optional = (isValid) => Object.assign((value) => isValid(value), { optional: true });

export const oneOf = (...values) => (value) => values.includes(value);

// Her API ucunu sarar: aynı kaynak, rate limit ve beklenmeyen hatalar tek yerde.
// cors: true ise CROSS_ORIGINS listesindeki siteler de çağırabilir ve yanıtı okuyabilir.
export function endpoint(handler, { getStore, checkOrigin = true, cors = false }) {
  return async (request) => {
    const crossOrigin = cors ? allowedCrossOrigin(request) : null;
    const respond = (response) => (crossOrigin ? withCors(response, crossOrigin) : response);
    try {
      if (checkOrigin && !isSameOrigin(request) && !crossOrigin) return fail(403, 'forbidden');
      const store = getStore();
      if (await isRateLimited(store, request)) return respond(fail(429, 'rate_limited'));
      return respond(await handler(request, store));
    } catch (error) {
      console.error(error);
      return respond(fail(500, 'server_error'));
    }
  };
}