import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../lib/random.js';
import { createCatalog, readTopicFile } from '../lib/catalog.js';
import { parseRef } from '../lib/questions.js';

function question(id, difficulty) {
  return {
    id,
    difficulty,
    type: 'choice',
    q: { tr: `Soru ${id}`, en: `Question ${id}` },
    options: { tr: ['a', 'b', 'c', 'd'], en: ['a', 'b', 'c', 'd'] },
    explain: { tr: 'Açıklama', en: 'Explanation' },
  };
}

const FILES = {
  science: {
    questions: [
      question('science:medium:001', 'medium'),
      question('science:medium:002', 'medium'),
      question('science:medium:003', 'medium'),
      question('science:easy:001', 'easy'),
    ],
  },
  history: { questions: [question('history:medium:001', 'medium')] },
};

function fakeReader() {
  const reads = [];
  const readTopic = async (topic) => {
    reads.push(topic);
    return FILES[topic] ?? { questions: [] };
  };
  return { readTopic, reads };
}
const NO_PEOPLE = async () => ({ people: [] });
const idsOf = (refs) => refs.map((ref) => parseRef(ref).id).sort();

test('pick returns distinct questions of the chosen difficulty', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  const refs = await catalog.pick({ area: 'general', topic: 'science', difficulty: 'medium' }, mulberry32(1), 10);
  assert.deepEqual(idsOf(refs), ['science:medium:001', 'science:medium:002', 'science:medium:003']);
});

test('pick respects the count', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  const refs = await catalog.pick({ area: 'general', topic: 'science', difficulty: 'medium' }, mulberry32(1), 2);
  assert.equal(refs.length, 2);
});

test('a mixed round draws from every general topic', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  const refs = await catalog.pick({ area: 'general', topic: 'mixed', difficulty: 'medium' }, mulberry32(1), 10);
  // Dört banka sorusunun hepsi gelir; kalan yerleri matematik üreteci doldurur.
  assert.ok(idsOf(refs).includes('history:medium:001'));
  assert.equal(refs.filter((ref) => !ref.startsWith('gen:')).length, 4);
  assert.equal(refs.length, 10);
});

test('resolve rebuilds a picked question', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  const [ref] = await catalog.pick({ area: 'general', topic: 'science', difficulty: 'easy' }, mulberry32(1), 1);
  const resolved = await catalog.resolve(ref, 'en');
  assert.equal(resolved.ref, ref);
  assert.equal(resolved.prompt, 'Question science:easy:001');
  assert.equal(resolved.options[resolved.answer], 'a');
});

test('resolve returns null for unknown or malformed refs', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  for (const ref of ['science:medium:999~1', 'weather:medium:001~1', 'nonsense', '../secrets~1']) {
    assert.equal(await catalog.resolve(ref, 'en'), null);
  }
});

test('each topic file is read only once', async () => {
  const { readTopic, reads } = fakeReader();
  const catalog = createCatalog(readTopic, NO_PEOPLE);
  await catalog.pick({ area: 'general', topic: 'science', difficulty: 'medium' }, mulberry32(1), 1);
  await catalog.resolve('science:medium:001~5', 'tr');
  assert.deepEqual(reads, ['science']);
});

test('a failed load is retried on the next request', async () => {
  let attempts = 0;
  const catalog = createCatalog(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('disk error');
    return FILES.science;
  }, NO_PEOPLE);
  await assert.rejects(catalog.resolve('science:medium:001~1', 'en'));
  assert.ok(await catalog.resolve('science:medium:001~1', 'en'));
});

test('invalid or misplaced questions are skipped', async (t) => {
  const warned = t.mock.method(console, 'warn', () => {});
  const catalog = createCatalog(async () => ({
    questions: [
      question('science:medium:001', 'medium'),
      question('science:medium:001', 'medium'),
      question('history:medium:001', 'medium'),
      { id: 'science:medium:002', difficulty: 'medium' },
    ],
  }), NO_PEOPLE);
  const refs = await catalog.pick({ area: 'general', topic: 'science', difficulty: 'medium' }, mulberry32(1), 10);
  assert.deepEqual(idsOf(refs), ['science:medium:001']);
  assert.equal(warned.mock.callCount(), 3);
});

test('the file reader refuses unknown topics', async () => {
  await assert.rejects(readTopicFile('../../package'));
});
test('a round mixes bank and generated questions half and half', async () => {
  const people = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'].map((id, i) => ({
    id,
    name: { tr: `Kişi ${i}`, en: `Person ${i}` },
    born: 1000 + i * 150,
    groups: [['writer', 'painter', 'composer', 'singer', 'actor', 'footballer'][i]],
    fame: 250,
  }));
  const bank = { questions: Array.from({ length: 10 }, (_, i) => question(`general:easy:00${i}`, 'easy')) };
  const catalog = createCatalog(async (topic) => (topic === 'general' ? bank : { questions: [] }), async () => ({ people }));
  const refs = await catalog.pick({ area: 'general', topic: 'general', difficulty: 'easy' }, mulberry32(4), 10);
  assert.equal(refs.length, 10);
  assert.equal(refs.filter((ref) => ref.startsWith('gen:')).length, 5);
  assert.ok(await catalog.resolve(refs.find((ref) => ref.startsWith('gen:')), 'tr'));
});

test('questions already seen are skipped until the pool runs out', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  const selection = { area: 'general', topic: 'science', difficulty: 'medium' };
  const first = await catalog.pick(selection, mulberry32(1), 2, ['science:medium:001']);
  assert.ok(!idsOf(first).includes('science:medium:001'));
  const all = await catalog.pick(selection, mulberry32(1), 3, ['science:medium:002', 'science:medium:001', 'science:medium:003']);
  assert.deepEqual(idsOf(all), ['science:medium:001', 'science:medium:002', 'science:medium:003']);
});
