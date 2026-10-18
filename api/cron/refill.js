// Gece görevi (vercel.json "crons"): yapay zekâ havuzunun sıradaki bölümlerini doldurur.
// Vercel bu isteğe "Authorization: Bearer <CRON_SECRET>" başlığını kendisi ekler; başlığı olmayan istek reddedilir.
import { timingSafeEqual, webcrypto } from 'node:crypto';
import { aiPool } from '../../lib/services.js';
import { createLlm } from '../../lib/ai/llm.js';
import { refill } from '../../lib/ai/refill.js';
import { mulberry32 } from '../../lib/random.js';
import { json, fail } from '../../lib/http.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function isAuthorized(request, secret = process.env.CRON_SECRET) {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function dayOf(request, now = Date.now()) {
  const value = new URL(request.url).searchParams.get('day');
  return value && /^\d{1,6}$/.test(value) ? Number(value) : Math.floor(now / DAY_MS);
}

export async function GET(request) {
  if (!isAuthorized(request)) return fail(401, 'unauthorized');
  const llm = createLlm();
  if (!llm.configured) return fail(503, 'not_configured');
  try {
    const reports = await refill({
      llm,
      pool: aiPool,
      random: mulberry32(webcrypto.getRandomValues(new Uint32Array(1))[0]),
      // Elle çalıştırırken ?day=N ile başka havuzlar seçilebilir (ilk doldurma); yoksa bugünün sırası
      day: dayOf(request),
    });
    // Sadece sayılar loglanır, soru metinleri değil
    console.log('ai refill', JSON.stringify(reports));
    return json({ reports });
  } catch (error) {
    console.error('ai refill failed:', error);
    return fail(500, 'server_error');
  }
}
