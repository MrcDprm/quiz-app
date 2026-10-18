import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OLD_LEVELS, areaOf, difficultyFromLevel, isValidSelection, topicsFor } from '../public/src/topics.js';
import { isValidQuestion, buildQuestion, makeRef, parseRef, toPublic } from '../lib/questions.js';

const CHOICE = {
  id: 'science:medium:001',
  difficulty: 'medium',
  type: 'choice',
  q: { tr: 'Suyun kimyasal formülü nedir?', en: 'What is the chemical formula of water?' },
  options: { tr: ['H2O', 'CO2', 'O2', 'NaCl'], en: ['H2O', 'CO2', 'O2', 'NaCl'] },
  explain: { tr: 'İki hidrojen, bir oksijen.', en: 'Two hydrogens, one oxygen.' },
};

const ORDER = {
  id: 'history:medium:001',
  difficulty: 'medium',
  type: 'order',
  q: { tr: 'Eskiden yeniye sırala.', en: 'Order from oldest to newest.' },
  items: { tr: ['A', 'B', 'C', 'D'], en: ['A', 'B', 'C', 'D'] },
  explain: { tr: 'A, B, C, D.', en: 'A, B, C, D.' },
};

const CODE = {
  ...CHOICE,
  id: 'python:easy:001',
  difficulty: 'easy',
  type: 'code',
  code: 'print(1 + 1)',
  q: { tr: 'Bu kod ne yazdırır?', en: 'What does this code print?' },
  options: { tr: ['2', '11', '1 + 1', 'Hata'], en: ['2', '11', '1 + 1', 'Error'] },
};

test('selections must match an area, a difficulty and a topic of that area', () => {
  assert.equal(isValidSelection({ area: 'general', topic: 'science', difficulty: 'medium' }), true);
  assert.equal(isValidSelection({ area: 'general', topic: 'mixed', difficulty: 'hard' }), true);
  assert.equal(isValidSelection({ area: 'software', topic: 'sql', difficulty: 'easy' }), true);
  assert.equal(isValidSelection({ area: 'software', topic: 'basics', difficulty: 'hard' }), true);
  assert.equal(isValidSelection({ area: 'software', topic: 'science', difficulty: 'easy' }), false);
  assert.equal(isValidSelection({ area: 'software', topic: 'sql', difficulty: 'advanced' }), false);
  assert.equal(isValidSelection({ area: 'software', topic: 'sql', difficulty: 'high' }), false);
  assert.equal(isValidSelection({ area: 'constructor', topic: 'sql', difficulty: 'medium' }), false);
});

test('every topic is played at every difficulty', () => {
  assert.equal(topicsFor('software').length, 9);
  assert.equal(topicsFor('general').length, 8);
  assert.equal(areaOf('sql'), 'software');
  assert.equal(areaOf('history'), 'general');
  assert.equal(areaOf('mixed'), null);
});

test('old school levels map to a difficulty inside each topic\'s own range', () => {
  // Genel konular beş seviyede soruluyordu
  assert.deepEqual(OLD_LEVELS.map((level) => difficultyFromLevel('history', level)), ['easy', 'easy', 'medium', 'hard', 'hard']);
  // JavaScript liseden başlıyordu: lise artık Kolay
  assert.deepEqual(OLD_LEVELS.map((level) => difficultyFromLevel('javascript', level)), [null, null, 'easy', 'medium', 'hard']);
  assert.deepEqual(OLD_LEVELS.map((level) => difficultyFromLevel('python', level)), [null, 'easy', 'medium', 'hard', 'hard']);
  assert.deepEqual(OLD_LEVELS.map((level) => difficultyFromLevel('basics', level)), ['easy', 'medium', 'hard', null, null]);
  assert.equal(difficultyFromLevel('history', 'phd'), null);
});

test('well-formed questions pass validation', () => {
  assert.equal(isValidQuestion(CHOICE), true);
  assert.equal(isValidQuestion(ORDER), true);
  assert.equal(isValidQuestion(CODE), true);
});

test('broken questions are rejected', () => {
  const broken = [
    null,
    { ...CHOICE, id: 'Science 1' },
    { ...CHOICE, difficulty: 'expert' },
    { ...CHOICE, type: 'image' },
    { ...CHOICE, q: { tr: 'Sadece Türkçe' } },
    { ...CHOICE, explain: { tr: ' ', en: 'x' } },
    { ...CHOICE, options: { tr: ['a', 'b', 'c'], en: ['a', 'b', 'c', 'd'] } },
    { ...CHOICE, options: { tr: ['a', 'a', 'c', 'd'], en: ['a', 'b', 'c', 'd'] } },
    { ...CHOICE, q: { tr: 'x'.repeat(301), en: 'x' } },
    { ...CODE, code: undefined },
    { ...ORDER, items: undefined },
  ];
  for (const raw of broken) {
    assert.equal(isValidQuestion(raw), false);
  }
});

test('refs round-trip and reject garbage', () => {
  assert.deepEqual(parseRef(makeRef('science:medium:001', 42)), { id: 'science:medium:001', seed: 42 });
  for (const ref of [null, '', 'x', 'x~', 'x~-1', 'x~1.5', 'x~1~2', '~5', 'x~99999999999']) {
    assert.equal(parseRef(ref), null);
  }
});

test('options are shuffled by seed and the answer follows the correct one', () => {
  for (let seed = 0; seed < 20; seed++) {
    const question = buildQuestion(CHOICE, seed, 'en');
    assert.deepEqual([...question.options].sort(), [...CHOICE.options.en].sort());
    assert.equal(question.options[question.answer], 'H2O');
    assert.deepEqual(buildQuestion(CHOICE, seed, 'en'), question);
  }
  const answers = new Set(Array.from({ length: 20 }, (_, seed) => buildQuestion(CHOICE, seed, 'en').answer));
  assert.ok(answers.size > 1);
});

test('the language picks the matching texts', () => {
  const question = buildQuestion(CODE, 7, 'tr');
  assert.equal(question.prompt, 'Bu kod ne yazdırır?');
  assert.ok(question.options.includes('Hata'));
  assert.equal(question.code, 'print(1 + 1)');
});

test('order answers put the shown items back in the right order', () => {
  for (let seed = 0; seed < 50; seed++) {
    const question = buildQuestion(ORDER, seed, 'en');
    assert.notDeepEqual(question.items, ORDER.items.en);
    assert.deepEqual(question.answer.map((i) => question.items[i]), ORDER.items.en);
  }
});

test('the public view hides the answer, the explanation and the seed', () => {
  const question = buildQuestion(CHOICE, 123456, 'en');
  const view = toPublic(question);
  assert.deepEqual(Object.keys(view).sort(), ['options', 'prompt', 'size', 'type']);
  assert.ok(!JSON.stringify(view).includes('123456'));
});