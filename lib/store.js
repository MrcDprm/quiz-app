// Tek kullanımlık jeton kaydı (claim) ve istek sayacı (hit).
// Canlıda Upstash Redis'in REST API'si, yerelde ve testlerde bellek içi depo kullanılır.

export function createMemoryStore(clock = Date.now) {
  const entries = new Map();

  function live(key) {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= clock()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    // Anahtar ilk kez yazılıyorsa true, daha önce yazılmışsa false.
    async claim(key, ttlMs) {
      if (live(key)) return false;
      entries.set(key, { count: 1, expiresAt: clock() + ttlMs });
      return true;
    },
    // Pencere içindeki istek sayısını bir artırıp döndürür.
    async hit(key, windowMs) {
      const entry = live(key) ?? { count: 0, expiresAt: clock() + windowMs };
      entry.count += 1;
      entries.set(key, entry);
      return entry.count;
    },
  };
}

export function createUpstashStore(url, token, fetchFn = fetch) {
  async function pipeline(commands) {
    const response = await fetchFn(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`Upstash responded with ${response.status}`);
    const results = await response.json();
    const failed = results.find((item) => item.error);
    if (failed) throw new Error(`Upstash error: ${failed.error}`);
    return results.map((item) => item.result);
  }

  return {
    async claim(key, ttlMs) {
      const [result] = await pipeline([['SET', key, '1', 'PX', String(ttlMs), 'NX']]);
      return result === 'OK';
    },
    async hit(key, windowMs) {
      const [, count] = await pipeline([
        ['SET', key, '0', 'PX', String(windowMs), 'NX'],
        ['INCR', key],
      ]);
      return count;
    },
  };
}

// Vercel'in Upstash entegrasyonu KV_* adlarını da kullanabildiği için ikisi de kabul edilir.
export function createStore(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (url && token) return createUpstashStore(url, token);
  if (env.QUIZ_DEV === '1') return createMemoryStore();
  throw new Error('Upstash settings are missing');
}