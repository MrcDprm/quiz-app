import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, STORAGE_KEY } from '../public/src/storage.js';

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
  });
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
  assert.deepEqual(Object.keys(written).sort(), ['area', 'daily', 'lang', 'level', 'streak', 'theme', 'topic']);
  assert.deepEqual(loadSettings(storage).daily, { date: '2026-09-30', correct: true });
});

test('saving fails quietly when storage is blocked', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(saveSettings(loadSettings(blocked), blocked), false);
});
