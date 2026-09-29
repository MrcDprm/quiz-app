// Soru dosyalarını yükler, doğrular, önbelleğe alır ve tura soru seçer.
import { readFile } from 'node:fs/promises';
import { AREAS, MIXED } from '../public/src/topics.js';
import { isValidQuestion, buildQuestion, makeRef, parseRef } from './questions.js';
import { sample, randomInt } from './random.js';

const BANK_DIR = new URL('../data/bank/', import.meta.url);

export function isKnownTopic(topic) {
  return Object.values(AREAS).some((area) => area.topics.includes(topic));
}

// data/bank/<konu>.json dosyasını okur. Henüz yazılmamış konu boş sayılır.
export async function readTopicFile(topic) {
  if (!isKnownTopic(topic)) throw new Error(`Unknown topic: ${topic}`);
  try {
    return JSON.parse(await readFile(new URL(`${topic}.json`, BANK_DIR), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { questions: [] };
    throw error;
  }
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

export function createCatalog(readTopic = readTopicFile) {
  const cache = new Map();

  // Her konu bir kez yüklenir; yükleme başarısız olursa bir sonraki istekte yeniden denenir.
  function load(topic) {
    if (!cache.has(topic)) {
      const promise = readTopic(topic)
        .then((data) => indexQuestions(topic, data))
        .catch((error) => {
          cache.delete(topic);
          throw error;
        });
      cache.set(topic, promise);
    }
    return cache.get(topic);
  }

  return {
    // Seçime uyan sorulardan count tane ref döndürür; her soruya yeni bir tohum verilir.
    async pick({ area, topic, level }, random, count) {
      const topics = topic === MIXED ? AREAS[area].topics : [topic];
      const banks = await Promise.all(topics.map(load));
      const pool = banks.flatMap((bank) => [...bank.values()]).filter((raw) => raw.level === level);
      return sample(random, pool, count).map((raw) => makeRef(raw.id, randomInt(random, 0, 0xffffffff)));
    },

    // Ref'ten soruyu yeniden kurar; bulunamazsa null.
    async resolve(ref, lang) {
      const parsed = parseRef(ref);
      if (!parsed) return null;
      const topic = parsed.id.split(':')[0];
      if (!isKnownTopic(topic)) return null;
      const raw = (await load(topic)).get(parsed.id);
      return raw ? buildQuestion(raw, parsed.seed, lang) : null;
    },
  };
}