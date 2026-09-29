import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, STORAGE_KEY } from '../public/src/storage.js';
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

test('defaults are used when nothing is saved', () => {
  const settings = loadSettings(fakeStorage(), 'en');
  assert.deepEqual(settings, {
    lang: 'en',
    theme: 'dark',
    area: 'general',
    level: 'primary',
    topic: 'math',
    streak: { count: 0, best: 0, lastDay: null },
    daily: null,
    stats: { ...EMPTY_STATS, topics: [], best: {} },
    mistakes: [],
    seen: {},
  });
});

test('seen questions are kept per valid selection', () => {
  const saved = JSON.stringify({
    seen: { 'general:geography:high': ['gen:capital:high:JP', 'geography:high:001', '<b>'], 'x:y:z': ['geography:high:002'] },
  });
  assert.deepEqual(loadSettings(fakeStorage(saved)).seen, { 'general:geography:high': ['gen:capital:high:JP', 'geography:high:001'] });
});

test('stats and mistakes are validated field by field', () => {
  const saved = JSON.stringify({
    stats: {
      rounds: 3,
      correct: -1,
      perfect: 'lots',
      topics: ['general:geography:high', 'general:geography:high', 'software:sql:primary', '<script>'],
      best: { 'general:geography:high': 142, 'nope:x:y': 99, 'general:math:high': -5 },
    },
    mistakes: ['science:high:004', 'gen:capital:high:JP', 'science:high:004', '<img>', 42, 'x~1'],
  });
  const { stats, mistakes } = loadSettings(fakeStorage(saved));
  assert.equal(stats.rounds, 3);
  assert.equal(stats.correct, 0);
  assert.equal(stats.perfect, 0);
  assert.deepEqual(stats.topics, ['general:geography:high']);
  assert.deepEqual(stats.best, { 'general:geography:high': 142 });
  assert.deepEqual(mistakes, ['science:high:004', 'gen:capital:high:JP']);
});

test('corrupted or unexpected values fall back to defaults', () => {
  const saved = JSON.stringify({
    lang: 'de',
    theme: 'neon',
    area: 'constructor',
    level: 7,
    topic: '<img src=x>',
    streak: { count: -3, best: 'many', lastDay: 'yesterday' },
    daily: { date: '2026-09-30', correct: 'yes' },
  });
  const settings = loadSettings(fakeStorage(saved), 'tr');
  assert.equal(settings.lang, 'tr');
  assert.equal(settings.area, 'general');
  assert.equal(settings.topic, 'math');
  assert.deepEqual(settings.streak, { count: 0, best: 0, lastDay: null });
  assert.equal(settings.daily, null);
  assert.equal(loadSettings(fakeStorage('{not json'), 'en').lang, 'en');
});

test('a topic not taught at the saved level is replaced', () => {
  const saved = JSON.stringify({ area: 'software', level: 'primary', topic: 'sql' });
  assert.equal(loadSettings(fakeStorage(saved)).topic, 'basics');
});

test('only known fields are written back', () => {
  const storage = fakeStorage();
  const settings = { ...loadSettings(storage), extra: 'secret', daily: { date: '2026-09-30', correct: true } };
  assert.equal(saveSettings(settings, storage), true);
  const written = JSON.parse(storage.raw());
  assert.deepEqual(Object.keys(written).sort(), ['area', 'daily', 'lang', 'level', 'mistakes', 'seen', 'stats', 'streak', 'theme', 'topic']);
  assert.deepEqual(loadSettings(storage).daily, { date: '2026-09-30', correct: true });
});

test('saving fails quietly when storage is blocked', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(saveSettings(loadSettings(blocked), blocked), false);
});
