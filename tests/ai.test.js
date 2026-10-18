// Yapay zekâ soru havuzu: biçim denetimi, havuz, gece görevi, katalog karışımı ve bildirme.
// Gerçek modeller çağrılmaz; sahte model aynı biçimde yanıt verir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../lib/store.js';
import { createPool, POOL_CAP, parseAiId } from '../lib/ai/pool.js';
import { normalizeText, toPoolItem } from '../lib/ai/validate.js';
import { createLlm, parseChain, parseJsonText } from '../lib/ai/llm.js';
import { BUCKETS, acceptVerified, bucketsFor, refill } from '../lib/ai/refill.js';
import { createCatalog } from '../lib/catalog.js';
import { createApi, REPORT_LIMIT } from '../lib/api.js';
import { mulberry32 } from '../lib/random.js';
import { dayOf, isAuthorized } from '../api/cron/refill.js';

const RAW = {
  question_tr: 'Hangi gezegen Güneş’e en yakındır?',
  question_en: 'Which planet is closest to the Sun?',
  correct_tr: 'Merkür',
  correct_en: 'Mercury',
  wrong_tr: ['Venüs', 'Mars', 'Jüpiter'],
  wrong_en: ['Venus', 'Mars', 'Jupiter'],
  explanation_tr: 'Merkür, Güneş’e en yakın gezegendir.',
  explanation_en: 'Mercury orbits closest to the Sun.',
};
const META = { topic: 'science', difficulty: 'easy', now: 1000, model: 'gemini-test' };

test('a well-formed question becomes a pool item with the right answer first', () => {
  const item = toPoolItem(RAW, META);
  assert.match(item.id, /^ai:science:easy:[0-9a-f]{10}$/);
  assert.equal(item.options.tr[0], 'Merkür');
  assert.equal(item.options.en[0], 'Mercury');
  assert.equal(item.type, 'choice');
  // Aynı soru metni aynı kimliği verir (tekrar eklenmez)
  assert.equal(toPoolItem({ ...RAW, question_en: '  Which planet is CLOSEST to the Sun? ' }, META).id, item.id);
});

test('broken or unfair questions are rejected', () => {
  const broken = [
    null,
    { ...RAW, wrong_tr: ['Venüs', 'Mars'] },
    { ...RAW, wrong_en: ['Venus', 'Mars', 'mercury'] }, // aynı şık iki kez
    { ...RAW, wrong_tr: ['Venüs', 'Mars', 'Hepsi'] },
    { ...RAW, wrong_en: ['Venus', 'Mars', 'None of the above'] },
    { ...RAW, question_en: 'Mercury: which planet is closest to the Sun?' }, // cevabı ele veriyor
    { ...RAW, question_en: 'Which planet is not a gas giant?' }, // olumsuz soru
    { ...RAW, explanation_tr: '<b>Merkür</b> en yakın.' },
    { ...RAW, question_tr: 'Kısa?' },
    { ...RAW, correct_en: 'x'.repeat(200) },
    // Türkçe karaktersiz yazılmış Türkçe
    { ...RAW, question_tr: 'Hangi gezegen Gunes sistemindeki en kucuk gezegendir?', explanation_tr: 'Merkur en kucuk gezegendir ve yorungesi kisadir.' },
  ];
  for (const raw of broken) assert.equal(toPoolItem(raw, META), null, JSON.stringify(raw)?.slice(0, 80));
});

test('normalizeText ignores case, accents and punctuation', () => {
  assert.equal(normalizeText('Which planet — is closest?'), 'which planet is closest');
  assert.equal(normalizeText('Café'), 'cafe');
});

test('model output: chains skip missing keys, JSON is found inside extra text', () => {
  assert.deepEqual(parseChain('gemini:a,groq:b,gemini:c', { gemini: 'k' }), [{ provider: 'gemini', model: 'a' }, { provider: 'gemini', model: 'c' }]);
  assert.deepEqual(parseChain('groq:openai/gpt-oss-120b', { groq: 'k' }), [{ provider: 'groq', model: 'openai/gpt-oss-120b' }]);
  assert.deepEqual(parseJsonText('Sure! {"a": 1} hope it helps'), { a: 1 });
  assert.equal(parseJsonText('no json'), null);
  assert.equal(parseJsonText('{broken'), null);
});

test('the verifier is never the model that wrote the question, and quota errors fall through', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body);
    const model = body.model ?? decodeURIComponent(url.split('/models/')[1].split(':')[0]);
    calls.push(model);
    if (model === 'openai/gpt-oss-120b') return new Response('{}', { status: 429 });
    const text = '{"results": []}';
    return Response.json(body.model ? { choices: [{ message: { content: text } }] } : { candidates: [{ content: { parts: [{ text }] } }] });
  };
  const llm = createLlm({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', AI_VERIFIERS: 'gemini:gen-model,groq:openai/gpt-oss-120b,groq:qwen/x' }, fetchFn);
  const { model } = await llm.verify({ system: 's', prompt: 'p' }, 'gen-model');
  assert.equal(model, 'qwen/x');
  assert.deepEqual(calls, ['openai/gpt-oss-120b', 'qwen/x']);
  assert.equal(createLlm({}, fetchFn).configured, false);
});

function poolSetup() {
  let now = 1_000_000;
  const clock = () => now;
  clock.advance = (ms) => { now += ms; };
  const store = createMemoryStore(clock);
  return { pool: createPool(() => store, { now: clock }), clock };
}

const item = (n, topic = 'science', difficulty = 'easy') => ({
  ...toPoolItem({ ...RAW, question_en: `Which planet number ${n} is closest to the Sun?` }, { ...META, topic, difficulty }),
});

test('the pool keeps one copy of each question and at most POOL_CAP', async () => {
  const { pool } = poolSetup();
  assert.equal(await pool.add('science', 'easy', [item(1), item(1), item(2)]), 2);
  assert.equal(await pool.add('science', 'easy', [item(2)]), 0);
  const many = Array.from({ length: POOL_CAP + 5 }, (_, i) => item(i + 10));
  await pool.add('science', 'easy', many);
  const list = await pool.list('science', 'easy');
  assert.equal(list.length, POOL_CAP);
  assert.equal(list.at(-1).id, many.at(-1).id); // en yeniler kalır
});

test('a reported question leaves the round pool but can still be answered for a day', async () => {
  const { pool, clock } = poolSetup();
  const one = item(1);
  await pool.add('science', 'easy', [one, item(2)]);
  assert.equal(await pool.hide(one.id), true);
  assert.equal(await pool.hide(one.id), false);
  assert.ok(!(await pool.list('science', 'easy')).some((entry) => entry.id === one.id));
  assert.ok(await pool.get(one.id));
  clock.advance(25 * 60 * 60 * 1000);
  await pool.add('science', 'easy', [item(3)]);
  assert.equal(await pool.get(one.id), null);
  assert.equal(parseAiId('ai:film-music:hard:0123456789').topic, 'film-music');
  assert.equal(parseAiId('ai:science:expert:0123456789'), null);
});

test('every night continues where the last one stopped', () => {
  const first = bucketsFor(0, 6);
  const second = bucketsFor(1, 6);
  assert.equal(first.length, 6);
  assert.notDeepEqual(first, second);
  const all = new Set(Array.from({ length: BUCKETS.length / 6 }, (_, day) => bucketsFor(day, 6)).flat().map((b) => `${b.topic}:${b.difficulty}`));
  assert.equal(all.size, BUCKETS.length);
});

test('only questions the verifier answers correctly and approves are accepted', () => {
  const items = [item(1), item(2), item(3)];
  // Doğru şık (0) gösterilen sırada: 1. soruda B, 2. soruda A, 3. soruda D
  const orders = [[1, 0, 2, 3], [0, 1, 2, 3], [3, 2, 1, 0]];
  const ok = { single_correct: true, accurate: true, languages_match: true, turkish_ok: true, stable_fact: true };
  const results = [
    { index: 0, answer: 'B', ...ok },
    { index: 1, answer: 'C', ...ok }, // yanlış harf
    { index: 2, answer: 'D', ...ok, turkish_ok: false },
  ];
  assert.deepEqual(acceptVerified(items, orders, results).map((entry) => entry.id), [items[0].id]);
  assert.deepEqual(acceptVerified(items, orders, [{ index: 0, answer: 'B', ...ok, accurate: false }]), []);
  assert.deepEqual(acceptVerified(items, orders, null), []);
});

/** Sahte model: istenen sayıda soru yazar; doğrulayıcı her zaman doğru harfi verir. */
function fakeLlm({ failTopic } = {}) {
  return {
    configured: true,
    async generate({ prompt }) {
      if (failTopic && prompt.includes(failTopic)) throw Object.assign(new Error('quota'), { code: 'quota' });
      const count = Number(prompt.match(/Write (\d+)/)[1]);
      const questions = Array.from({ length: count }, (_, i) => ({ ...RAW, question_en: `Fake question ${prompt.length} ${i} about the Sun?` }));
      questions[0] = { ...questions[0], wrong_tr: ['bad'] }; // biri biçimden kalır
      return { model: 'gen', data: { questions } };
    },
    async verify({ prompt }, generatorModel) {
      assert.equal(generatorModel, 'gen');
      const blocks = prompt.split('\n\n');
      const results = blocks.map((block, index) => {
        const line = block.split('\n').find((row) => / Mercury \//.test(row));
        return { index, answer: line[0], single_correct: true, accurate: true, languages_match: true, turkish_ok: true, stable_fact: true };
      });
      return { model: 'checker', data: { results } };
    },
  };
}

test('a nightly run fills the day\'s pools and keeps going after a failing one', async () => {
  const { pool } = poolSetup();
  const day = 0;
  // İlk günün havuzları: tarih kolay, orta, zor. Orta zorluktaki yazım çağrısı kota hatası verir.
  assert.deepEqual(bucketsFor(day, 3).map((bucket) => bucket.difficulty), ['easy', 'medium', 'hard']);
  const reports = await refill({ llm: fakeLlm({ failTopic: 'MEDIUM:' }), pool, random: mulberry32(1), day, perRun: 3, perBucket: 4 });
  assert.equal(reports.length, 3);
  assert.equal(reports.filter((report) => report.error).length, 1);
  for (const report of reports) {
    if (report.difficulty === 'medium') {
      assert.equal(report.error, 'quota');
      continue;
    }
    assert.deepEqual([report.generated, report.valid, report.accepted, report.added], [4, 3, 3, 3]);
    const stored = await pool.list(report.topic, report.difficulty);
    assert.equal(stored.length, 3);
    assert.equal(stored[0].verifier, 'checker');
  }
});

// Katalog: banka ve şablonlarla birlikte havuz soruları
function catalogWith(pool) {
  const bank = { questions: Array.from({ length: 10 }, (_, i) => ({ ...item(i + 100), id: `science:easy:${String(i + 1).padStart(3, '0')}`, difficulty: 'easy' })) };
  return createCatalog(async (topic) => (topic === 'science' ? bank : { questions: [] }), async () => ({ people: [] }), pool);
}

test('a round takes at most 3 pool questions, never in mixed rounds or with aiCount 0', async () => {
  const { pool } = poolSetup();
  await pool.add('science', 'easy', Array.from({ length: 8 }, (_, i) => item(i)));
  const catalog = catalogWith(pool);
  const ids = (refs) => refs.map((ref) => ref.split('~')[0]);
  const round = ids(await catalog.pick({ area: 'general', topic: 'science', difficulty: 'easy' }, mulberry32(3), 10));
  assert.equal(round.filter((id) => id.startsWith('ai:')).length, 3);
  assert.equal(round.length, 10);
  const mixed = ids(await catalog.pick({ area: 'general', topic: 'mixed', difficulty: 'easy' }, mulberry32(3), 10));
  assert.ok(!mixed.some((id) => id.startsWith('ai:')));
  const daily = ids(await catalog.pick({ area: 'general', topic: 'science', difficulty: 'easy' }, mulberry32(3), 1, [], { aiCount: 0 }));
  assert.ok(!daily.some((id) => id.startsWith('ai:')));
});

test('pool questions resolve with an AI flag; a broken pool does not break the round', async () => {
  const { pool } = poolSetup();
  const one = item(1);
  await pool.add('science', 'easy', [one]);
  const question = await catalogWith(pool).resolve(`${one.id}~42`, 'tr');
  assert.equal(question.ai, true);
  assert.equal(question.options[question.answer], 'Merkür');

  const broken = { list: async () => { throw new Error('down'); }, get: async () => null };
  const refs = await catalogWith(broken).pick({ area: 'general', topic: 'science', difficulty: 'easy' }, mulberry32(3), 10);
  assert.equal(refs.length, 10);
});

test('reporting hides an AI question, refuses other ids and is rate limited', async () => {
  const { pool } = poolSetup();
  const one = item(1);
  await pool.add('science', 'easy', [one]);
  const store = createMemoryStore();
  const api = createApi({ catalog: catalogWith(pool), getStore: () => store, getKey: () => Buffer.alloc(32), aiPool: pool });
  const report = (id) => api.report(new Request('https://quiz.test/api/report', {
    method: 'POST',
    headers: { host: 'quiz.test', origin: 'https://quiz.test', 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({ id }),
  }));
  assert.equal((await report(one.id)).status, 200);
  assert.equal((await pool.list('science', 'easy')).length, 0);
  assert.equal((await report('science:easy:001')).status, 400);
  for (let i = 1; i < REPORT_LIMIT; i++) await report(one.id);
  assert.equal((await report(one.id)).status, 429);
});

test('the nightly job only runs with the cron secret', () => {
  const request = (value) => new Request('https://quiz.test/api/cron/refill', { headers: value ? { authorization: value } : {} });
  assert.equal(isAuthorized(request('Bearer s3cret-value'), 's3cret-value'), true);
  assert.equal(isAuthorized(request('Bearer wrong'), 's3cret-value'), false);
  assert.equal(isAuthorized(request(), 's3cret-value'), false);
  assert.equal(isAuthorized(request('Bearer '), ''), false);
  // ?day ile elle başka havuzlar seçilebilir; geçersiz değerde bugünün sırası
  const at = (query) => dayOf(new Request(`https://quiz.test/api/cron/refill${query}`), 3 * 86_400_000 + 5);
  assert.equal(at(''), 3);
  assert.equal(at('?day=7'), 7);
  assert.equal(at('?day=-1'), 3);
  assert.equal(at('?day=abc'), 3);
});
