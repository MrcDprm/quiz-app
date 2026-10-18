// Odanın sorularını normal yarışmanın kataloğundan alır (soru bankası + veri şablonları).
// Sıralama soruları birlikte oynamada telefonda zahmetli olduğu için alınmaz.
import { webcrypto } from 'node:crypto';
import { createCatalog } from '../lib/catalog.js';
import { isValidSelection, LANGS } from '../public/src/topics.js';
import { mulberry32 } from '../lib/random.js';

// Sıralama soruları elenince sayı yetsin diye iki katı seçilir (tarihte sıralama sorusu çok)
const SPARE = 2;

const secureRandom = () => mulberry32(webcrypto.getRandomValues(new Uint32Array(1))[0]);

export function createQuestionLoader(catalog = createCatalog(), newRandom = secureRandom) {
  return async function loadQuestions({ area, topic, difficulty, lang, count }) {
    if (!isValidSelection({ area, topic, difficulty }) || !LANGS.includes(lang)) return [];
    const refs = await catalog.pick({ area, topic, difficulty }, newRandom(), count * SPARE, [], { aiCount: 0 });
    const questions = await Promise.all(refs.map((ref) => catalog.resolve(ref, lang)));
    return questions
      .filter((question) => question && question.type !== 'order')
      .slice(0, count)
      .map(({ type, prompt, options, answer, explain, image, code }) => ({
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
