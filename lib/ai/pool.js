// Yapay zekâ soru havuzu: her konu ve zorluk için Redis'te tek bir JSON dizi (en fazla POOL_CAP soru).
// Tur başlarken okunur; Upstash'in ücretsiz komut kotası için okumalar birkaç dakika bellekte tutulur.
// Bildirilen soru silinmez, gizlenir: o an süren turlar cevabını hâlâ açabilsin; ertesi gün atılır.
import { AI_ID, normalizeText } from './validate.js';

export const POOL_CAP = 120;
const CACHE_MS = 5 * 60 * 1000;
const HIDDEN_KEEP_MS = 24 * 60 * 60 * 1000;

const keyOf = (topic, difficulty) => `ai:pool:${topic}:${difficulty}`;

export function parseAiId(id) {
  const match = AI_ID.exec(id);
  return match ? { topic: match[1], difficulty: match[2] } : null;
}

export function createPool(getStore, { now = Date.now } = {}) {
  const cache = new Map();

  async function read(topic, difficulty, fresh = false) {
    const key = keyOf(topic, difficulty);
    const cached = cache.get(key);
    if (!fresh && cached && now() - cached.at < CACHE_MS) return cached.items;
    const stored = await getStore().getJson(key);
    const items = Array.isArray(stored) ? stored.filter((item) => item && AI_ID.test(item.id)) : [];
    cache.set(key, { at: now(), items });
    return items;
  }

  async function write(topic, difficulty, items) {
    const key = keyOf(topic, difficulty);
    await getStore().setJson(key, items);
    cache.set(key, { at: now(), items });
  }

  return {
    /** Tura girebilecek sorular (gizlenenler hariç). */
    async list(topic, difficulty) {
      return (await read(topic, difficulty)).filter((item) => !item.hidden);
    },

    /** Kimlikten soru; gizlenmiş olsa da döner (süren tur bozulmasın). */
    async get(id) {
      const parsed = parseAiId(id);
      if (!parsed) return null;
      const items = await read(parsed.topic, parsed.difficulty);
      return items.find((item) => item.id === id) ?? null;
    },

    /** Yeni soruları ekler: aynı kimlik ya da aynı metin bir kez girer, en eskiler sınırın dışına düşer. */
    async add(topic, difficulty, incoming) {
      const items = (await read(topic, difficulty, true)).filter((item) => !item.hidden || now() - item.hidden < HIDDEN_KEEP_MS);
      const ids = new Set(items.map((item) => item.id));
      const texts = new Set(items.map((item) => normalizeText(item.q.en)));
      let added = 0;
      for (const item of incoming) {
        const text = normalizeText(item.q.en);
        if (ids.has(item.id) || texts.has(text)) continue;
        items.push(item);
        ids.add(item.id);
        texts.add(text);
        added += 1;
      }
      await write(topic, difficulty, items.slice(-POOL_CAP));
      return added;
    },

    /** Bildirilen soruyu gizler; yoksa ya da zaten gizliyse false. */
    async hide(id) {
      const parsed = parseAiId(id);
      if (!parsed) return false;
      const items = await read(parsed.topic, parsed.difficulty, true);
      const item = items.find((entry) => entry.id === id);
      if (!item || item.hidden) return false;
      item.hidden = now();
      await write(parsed.topic, parsed.difficulty, items);
      return true;
    },

    /** Son eklenen soruların İngilizce metinleri: modelin aynı soruları yeniden yazmaması için. */
    async recentTexts(topic, difficulty, count) {
      return (await read(topic, difficulty, true)).slice(-count).map((item) => item.q.en);
    },
  };
}
