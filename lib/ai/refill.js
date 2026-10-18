// Gece görevi: sıradaki birkaç havuz için soru yazdırır, biçimini denetler, ikinci bir modele doğrulatır
// ve geçenleri havuza ekler. Her gece farklı havuzlar sırayla dolar (bütün havuzlar birkaç günde bir tur atar).
import { DIFFICULTIES } from '../../public/src/topics.js';
import { pick as pickOne, shuffle } from '../random.js';
import {
  AI_TOPICS, GENERATION_SCHEMA, GENERATION_SYSTEM, SUBTOPICS, VERIFY_SYSTEM, generationPrompt, letterOf, verifyPrompt,
} from './prompts.js';
import { toPoolItem } from './validate.js';

export const BUCKETS = AI_TOPICS.flatMap((topic) => DIFFICULTIES.map((difficulty) => ({ topic, difficulty })));
export const PER_RUN = 6;
export const PER_BUCKET = 6;
const AVOID_COUNT = 40;
// Vercel'in süre sınırından önce yeni havuza başlamayı bırakır
const TIME_BUDGET_MS = 220_000;

/** Günün havuzları: gün numarasına göre kayan pencere. */
export function bucketsFor(day, perRun = PER_RUN) {
  const start = (day * perRun) % BUCKETS.length;
  return Array.from({ length: Math.min(perRun, BUCKETS.length) }, (_, i) => BUCKETS[(start + i) % BUCKETS.length]);
}

/**
 * Doğrulayıcının kararına göre geçen sorular. Şıklar doğrulayıcıya karışık sırada gider;
 * doğrulayıcının seçtiği harf, doğru şıkkın gösterildiği yere denk gelmelidir.
 */
export function acceptVerified(items, orders, results) {
  const byIndex = new Map((Array.isArray(results) ? results : []).filter((r) => r && Number.isInteger(r.index)).map((r) => [r.index, r]));
  return items.filter((item, index) => {
    const result = byIndex.get(index);
    if (!result) return false;
    const correctLetter = letterOf(orders[index].indexOf(0));
    return (
      result.answer === correctLetter &&
      result.single_correct === true &&
      result.accurate === true &&
      result.languages_match === true &&
      result.turkish_ok === true &&
      result.stable_fact === true
    );
  });
}

async function refillBucket({ topic, difficulty }, { llm, pool, random, now, perBucket }) {
  const report = { topic, difficulty, generated: 0, valid: 0, accepted: 0, added: 0 };
  const avoid = await pool.recentTexts(topic, difficulty, AVOID_COUNT);
  const subtopic = pickOne(random, SUBTOPICS[topic]);
  const { model, data } = await llm.generate({
    system: GENERATION_SYSTEM,
    prompt: generationPrompt({ topic, difficulty, subtopic, count: perBucket, avoid }),
    schema: GENERATION_SCHEMA,
  });
  const raw = Array.isArray(data?.questions) ? data.questions.slice(0, perBucket) : [];
  report.generated = raw.length;
  const items = raw.map((question) => toPoolItem(question, { topic, difficulty, now: now(), model })).filter(Boolean);
  report.valid = items.length;
  if (items.length === 0) return report;

  // Doğru şık hep ilk sırada saklanır; doğrulayıcıya karıştırılmış sırayla gösterilir
  const orders = items.map(() => shuffle(random, [0, 1, 2, 3]));
  const shown = items.map((item, i) => ({
    q: item.q,
    options: { tr: orders[i].map((k) => item.options.tr[k]), en: orders[i].map((k) => item.options.en[k]) },
  }));
  const verdict = await llm.verify({ system: VERIFY_SYSTEM, prompt: verifyPrompt(shown) }, model);
  const accepted = acceptVerified(items, orders, verdict.data?.results).map((item) => ({ ...item, verifier: verdict.model }));
  report.accepted = accepted.length;
  report.added = accepted.length ? await pool.add(topic, difficulty, accepted) : 0;
  return report;
}

/** Bir gecelik çalışma. Bir havuzda hata olursa diğerlerine devam edilir; rapor her havuzun sonucunu içerir. */
export async function refill({ llm, pool, random, day, now = Date.now, perRun = PER_RUN, perBucket = PER_BUCKET }) {
  const started = now();
  const reports = [];
  for (const bucket of bucketsFor(day, perRun)) {
    if (now() - started > TIME_BUDGET_MS) {
      reports.push({ ...bucket, skipped: 'time' });
      continue;
    }
    try {
      reports.push(await refillBucket(bucket, { llm, pool, random, now, perBucket }));
    } catch (error) {
      reports.push({ ...bucket, error: error?.code ?? 'error' });
    }
  }
  return reports;
}
