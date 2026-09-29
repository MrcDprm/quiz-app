import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../lib/random.js';
import { createCatalog, readTopicFile } from '../lib/catalog.js';
import { parseRef } from '../lib/questions.js';

function question(id, level) {
  return {
    id,
    level,
    type: 'choice',
    q: { tr: `Soru ${id}`, en: `Question ${id}` },
    options: { tr: ['a', 'b', 'c', 'd'], en: ['a', 'b', 'c', 'd'] },
    explain: { tr: 'Açıklama', en: 'Explanation' },
  };
}

const FILES = {
  science: {
    questions: [
      question('science:high:001', 'high'),
      question('science:high:002', 'high'),
      question('science:high:003', 'high'),
      question('science:primary:001', 'primary'),
    ],
  },
  history: { questions: [question('history:high:001', 'high')] },
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

test('pick returns distinct questions of the chosen level', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  const refs = await catalog.pick({ area: 'general', topic: 'science', level: 'high' }, mulberry32(1), 10);
  assert.deepEqual(idsOf(refs), ['science:high:001', 'science:high:002', 'science:high:003']);
});

test('pick respects the count', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  const refs = await catalog.pick({ area: 'general', topic: 'science', level: 'high' }, mulberry32(1), 2);
  assert.equal(refs.length, 2);
});

test('a mixed round draws from every general topic', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  const refs = await catalog.pick({ area: 'general', topic: 'mixed', level: 'high' }, mulberry32(1), 10);
  // Dört banka sorusunun hepsi gelir; kalan yerleri matematik üreteci doldurur.
  assert.ok(idsOf(refs).includes('history:high:001'));
  assert.equal(refs.filter((ref) => !ref.startsWith('gen:')).length, 4);
  assert.equal(refs.length, 10);
});

test('resolve rebuilds a picked question', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  const [ref] = await catalog.pick({ area: 'general', topic: 'science', level: 'primary' }, mulberry32(1), 1);
  const resolved = await catalog.resolve(ref, 'en');
  assert.equal(resolved.ref, ref);
  assert.equal(resolved.prompt, 'Question science:primary:001');
  assert.equal(resolved.options[resolved.answer], 'a');
});

test('resolve returns null for unknown or malformed refs', async () => {
  const catalog = createCatalog(fakeReader().readTopic, NO_PEOPLE);
  for (const ref of ['science:high:999~1', 'weather:high:001~1', 'nonsense', '../secrets~1']) {
    assert.equal(await catalog.resolve(ref, 'en'), null);
  }
});

test('each topic file is read only once', async () => {
  const { readTopic, reads } = fakeReader();
  const catalog = createCatalog(readTopic, NO_PEOPLE);
  await catalog.pick({ area: 'general', topic: 'science', level: 'high' }, mulberry32(1), 1);
  await catalog.resolve('science:high:001~5', 'tr');
  assert.deepEqual(reads, ['science']);
});

test('a failed load is retried on the next request', async () => {
  let attempts = 0;
  const catalog = createCatalog(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('disk error');
    return FILES.science;
  }, NO_PEOPLE);
  await assert.rejects(catalog.resolve('science:high:001~1', 'en'));
  assert.ok(await catalog.resolve('science:high:001~1', 'en'));
});

test('invalid or misplaced questions are skipped', async (t) => {
  const warned = t.mock.method(console, 'warn', () => {});
  const catalog = createCatalog(async () => ({
    questions: [
      question('science:high:001', 'high'),
      question('science:high:001', 'high'),
      question('history:high:001', 'high'),
      { id: 'science:high:002', level: 'high' },
    ],
  }), NO_PEOPLE);
  const refs = await catalog.pick({ area: 'general', topic: 'science', level: 'high' }, mulberry32(1), 10);
  assert.deepEqual(idsOf(refs), ['science:high:001']);
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
  const bank = { questions: Array.from({ length: 10 }, (_, i) => question(`general:primary:00${i}`, 'primary')) };
  const catalog = createCatalog(async (topic) => (topic === 'general' ? bank : { questions: [] }), async () => ({ people }));
  const refs = await catalog.pick({ area: 'general', topic: 'general', level: 'primary' }, mulberry32(4), 10);
  assert.equal(refs.length, 10);
  assert.equal(refs.filter((ref) => ref.startsWith('gen:')).length, 5);
  assert.ok(await catalog.resolve(refs.find((ref) => ref.startsWith('gen:')), 'tr'));
});
