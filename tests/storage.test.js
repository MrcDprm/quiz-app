import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, STORAGE_KEY, VERSION } from '../public/src/storage.js';
import { EMPTY_STATS } from '../public/src/progress.js';

// localStorage yerine geçen küçük bir sahte depo.
function fakeStorage(initial) {
  const data = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    raw: () => data.get(STORAGE_KEY),
  };
}

// Bu sürümde kaydedilmiş ayarlar (sürümsüz kayıt ilk sürümden sayılır ve taşınır)
const current = (fields) => JSON.stringify({ version: VERSION, ...fields });

test('defaults are used when nothing is saved', () => {
  const settings = loadSettings(fakeStorage(), 'en');
  assert.deepEqual(settings, {
    lang: 'en',
    theme: 'dark',
    area: 'general',
    difficulty: 'easy',
    topic: 'history',
    streak: { count: 0, best: 0, lastDay: null },
    daily: null,
    stats: { ...EMPTY_STATS, topics: [], best: {} },
    mistakes: [],
    seen: {},
  });
});

test('seen questions are kept per valid selection', () => {
  const saved = current({
    seen: { 'general:geography:medium': ['gen:capital:medium:JP', 'geography:medium:001', '<b>'], 'x:y:z': ['geography:medium:002'] },
  });
  assert.deepEqual(loadSettings(fakeStorage(saved)).seen, { 'general:geography:medium': ['gen:capital:medium:JP', 'geography:medium:001'] });
});

test('stats and mistakes are validated field by field', () => {
  const saved = current({
    stats: {
      rounds: 3,
      correct: -1,
      perfect: 'lots',
      topics: ['general:geography:medium', 'general:geography:medium', 'software:history:easy', '<script>'],
      best: { 'general:geography:medium': 142, 'nope:x:y': 99, 'general:math:medium': -5 },
    },
    mistakes: ['science:medium:004', 'gen:capital:medium:JP', 'science:medium:004', '<img>', 42, 'x~1'],
  });
  const { stats, mistakes } = loadSettings(fakeStorage(saved));
  assert.equal(stats.rounds, 3);
  assert.equal(stats.correct, 0);
  assert.equal(stats.perfect, 0);
  assert.deepEqual(stats.topics, ['general:geography:medium']);
  assert.deepEqual(stats.best, { 'general:geography:medium': 142 });
  assert.deepEqual(mistakes, ['science:medium:004', 'gen:capital:medium:JP']);
});

test('corrupted or unexpected values fall back to defaults', () => {
  const saved = current({
    lang: 'de',
    theme: 'neon',
    area: 'constructor',
    difficulty: 7,
    topic: '<img src=x>',
    streak: { count: -3, best: 'many', lastDay: 'yesterday' },
    daily: { date: '2026-09-30', correct: 'yes' },
  });
  const settings = loadSettings(fakeStorage(saved), 'tr');
  assert.equal(settings.lang, 'tr');
  assert.equal(settings.area, 'general');
  assert.equal(settings.topic, 'history');
  assert.equal(settings.difficulty, 'easy');
  assert.deepEqual(settings.streak, { count: 0, best: 0, lastDay: null });
  assert.equal(settings.daily, null);
  assert.equal(loadSettings(fakeStorage('{not json'), 'en').lang, 'en');
});

test('a topic from another area is replaced by the first topic of the area', () => {
  const saved = current({ area: 'software', difficulty: 'hard', topic: 'history' });
  assert.equal(loadSettings(fakeStorage(saved)).topic, 'basics');
});

test('settings saved by the first version move to difficulties', () => {
  const saved = JSON.stringify({
    area: 'software',
    topic: 'javascript',
    level: 'high',
    stats: {
      rounds: 4,
      mastersHigh: 2,
      topics: ['general:history:primary', 'general:history:middle', 'software:javascript:high', 'software:javascript:primary'],
      best: { 'general:history:primary': 140, 'general:history:middle': 120, 'software:javascript:masters': 90, 'nope:x:high': 5 },
    },
    mistakes: ['history:middle:004'],
    seen: { 'general:history:middle': ['history:middle:001'] },
  });
  const settings = loadSettings(fakeStorage(saved));
  // JavaScript liseden başlıyordu: lise Kolay oldu
  assert.equal(settings.difficulty, 'easy');
  assert.equal(settings.stats.rounds, 4);
  assert.equal(settings.stats.hardHigh, 2);
  // İki seviye aynı zorluğa düştü: tek kayıt, büyük puan
  assert.deepEqual(settings.stats.topics, ['general:history:easy', 'software:javascript:easy']);
  assert.deepEqual(settings.stats.best, { 'general:history:easy': 140, 'software:javascript:hard': 90 });
  // Eski soru kimlikleri artık yok
  assert.deepEqual(settings.mistakes, []);
  assert.deepEqual(settings.seen, {});
});

test('only known fields are written back', () => {
  const storage = fakeStorage();
  const settings = { ...loadSettings(storage), extra: 'secret', daily: { date: '2026-09-30', correct: true } };
  assert.equal(saveSettings(settings, storage), true);
  const written = JSON.parse(storage.raw());
  assert.deepEqual(Object.keys(written).sort(), ['area', 'daily', 'difficulty', 'lang', 'mistakes', 'seen', 'stats', 'streak', 'theme', 'topic', 'version']);
  assert.deepEqual(loadSettings(storage).daily, { date: '2026-09-30', correct: true });
});

test('saving fails quietly when storage is blocked', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(saveSettings(loadSettings(blocked), blocked), false);
});
