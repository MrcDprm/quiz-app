// Soru dosyalarını yükler, doğrular, önbelleğe alır ve tura soru seçer.
// Bir tur, soru bankasından ve şablon üreteçlerinden gelen soruların karışımıdır.
import { readFile } from 'node:fs/promises';
import { AREAS, MIXED } from '../public/src/topics.js';
import { isValidQuestion, buildQuestion, makeRef, parseRef } from './questions.js';
import { createGenerators } from './generators.js';
import { sample, shuffle, randomInt } from './random.js';

const DATA_DIR = new URL('../data/', import.meta.url);
const GENERATED_FILES = ['people'];

export function isKnownTopic(topic) {
  return Object.values(AREAS).some((area) => area.topics.includes(topic));
}

// data/bank/<konu>.json dosyasını okur. Henüz yazılmamış konu boş sayılır.
export async function readTopicFile(topic) {
  if (!isKnownTopic(topic)) throw new Error(`Unknown topic: ${topic}`);
  try {
    return JSON.parse(await readFile(new URL(`bank/${topic}.json`, DATA_DIR), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { questions: [] };
    throw error;
  }
}

// data/generated/*.json dosyalarını okur: { people: [...] }
export async function readGeneratedFiles() {
  const entries = await Promise.all(
    GENERATED_FILES.map(async (name) => {
      const data = JSON.parse(await readFile(new URL(`generated/${name}.json`, DATA_DIR), 'utf8'));
      return [name, Array.isArray(data?.items) ? data.items : []];
    }),
  );
  return Object.fromEntries(entries);
}

// Geçersiz, başka konuya ait ya da tekrar eden kayıtlar atlanır ve loga yazılır.
function indexQuestions(topic, data) {
  const questions = new Map();
  const list = Array.isArray(data?.questions) ? data.questions : [];
  for (const raw of list) {
    if (isValidQuestion(raw) && raw.id.startsWith(`${topic}:`) && !questions.has(raw.id)) {
      questions.set(raw.id, raw);
    } else {
      console.warn(`Skipped question in ${topic}: ${raw?.id ?? 'no id'}`);
    }
  }
  return questions;
}

// Aynı anahtar için tek yükleme; hata olursa bir sonraki çağrıda yeniden denenir.
function memoize(load) {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) {
      const promise = load(key).catch((error) => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, promise);
    }
    return cache.get(key);
  };
}

export function createCatalog(readTopic = readTopicFile, readGenerated = readGeneratedFiles) {
  const loadBank = memoize(async (topic) => indexQuestions(topic, await readTopic(topic)));
  const loadGenerators = memoize(async () => createGenerators(await readGenerated()));
  const newSeed = (random) => randomInt(random, 0, 0xffffffff);

  return {
    // Seçime uyan count tane ref döndürür. Yarısı üreteçlerden, yarısı bankadan alınır;
    // biri yetmezse diğeri tamamlar. Her soruya yeni bir tohum verilir.
    async pick({ area, topic, level }, random, count) {
      const topics = topic === MIXED ? AREAS[area].topics : [topic];
      const [banks, generators] = await Promise.all([Promise.all(topics.map(loadBank)), loadGenerators()]);

      const bankIds = sample(
        random,
        banks.flatMap((bank) => [...bank.values()]).filter((raw) => raw.level === level),
        count,
      ).map((raw) => raw.id);
      const generatedIds = sample(
        random,
        topics.flatMap((name) => generators.pick(name, level, random, count)),
        count,
      );

      const half = Math.ceil(count / 2);
      const chosen = [
        ...generatedIds.slice(0, half),
        ...bankIds.slice(0, count - half),
        ...generatedIds.slice(half),
        ...bankIds.slice(count - half),
      ].slice(0, count);
      return shuffle(random, chosen).map((id) => makeRef(id, newSeed(random)));
    },

    // Ref'ten soruyu yeniden kurar; bulunamazsa null.
    async resolve(ref, lang) {
      const parsed = parseRef(ref);
      if (!parsed) return null;
      const topic = parsed.id.split(':')[0];
      if (topic === 'gen') return (await loadGenerators()).build(parsed.id, parsed.seed, lang);
      if (!isKnownTopic(topic)) return null;
      const raw = (await loadBank(topic)).get(parsed.id);
      return raw ? buildQuestion(raw, parsed.seed, lang) : null;
    },
  };
}