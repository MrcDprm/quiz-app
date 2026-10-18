// Odanın sorularını normal yarışmanın kataloğundan alır (soru bankası + veri şablonları).
// Sıralama soruları birlikte oynamada telefonda zahmetli olduğu için alınmaz.
import { webcrypto } from 'node:crypto';
import { createCatalog } from '../lib/catalog.js';
import { parseRef } from '../lib/questions.js';
import { isValidSelection, LANGS } from '../public/src/topics.js';
import { mulberry32 } from '../lib/random.js';

// Tarihte şablon sorularının çoğu sıralama sorusu; yeterli soru toplanana kadar birkaç kez seçilir
const ATTEMPTS = 4;

const secureRandom = () => mulberry32(webcrypto.getRandomValues(new Uint32Array(1))[0]);

export function createQuestionLoader(catalog = createCatalog(), newRandom = secureRandom) {
  return async function loadQuestions({ area, topic, difficulty, lang, count }) {
    if (!isValidSelection({ area, topic, difficulty }) || !LANGS.includes(lang)) return [];
    const chosen = [];
    const seen = [];
    for (let attempt = 0; attempt < ATTEMPTS && chosen.length < count; attempt++) {
      // Daha önce seçilenler "görülmüş" sayılır; katalog önce yenileri verir
      const refs = await catalog.pick({ area, topic, difficulty }, newRandom(), count, seen.slice(-50), { aiCount: 0 });
      const fresh = refs.filter((ref) => !seen.includes(parseRef(ref).id));
      if (fresh.length === 0) break;
      for (const ref of fresh) seen.push(parseRef(ref).id);
      const questions = await Promise.all(fresh.map((ref) => catalog.resolve(ref, lang)));
      chosen.push(...questions.filter((question) => question && question.type !== 'order'));
    }
    return chosen.slice(0, count).map(({ type, prompt, options, answer, explain, image, code }) => ({
      type,
      prompt,
      options,
      answer,
      explain,
      ...(image && { image }),
      ...(code && { code }),
    }));
  };
}
