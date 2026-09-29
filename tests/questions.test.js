import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidSelection } from '../public/src/topics.js';
import { isValidQuestion, buildQuestion, makeRef, parseRef, toPublic } from '../lib/questions.js';

const CHOICE = {
  id: 'science:high:001',
  level: 'high',
  type: 'choice',
  q: { tr: 'Suyun kimyasal formülü nedir?', en: 'What is the chemical formula of water?' },
  options: { tr: ['H2O', 'CO2', 'O2', 'NaCl'], en: ['H2O', 'CO2', 'O2', 'NaCl'] },
  explain: { tr: 'İki hidrojen, bir oksijen.', en: 'Two hydrogens, one oxygen.' },
};

const ORDER = {
  id: 'history:high:001',
  level: 'high',
  type: 'order',
  q: { tr: 'Eskiden yeniye sırala.', en: 'Order from oldest to newest.' },
  items: { tr: ['A', 'B', 'C', 'D'], en: ['A', 'B', 'C', 'D'] },
  explain: { tr: 'A, B, C, D.', en: 'A, B, C, D.' },
};

const CODE = {
  ...CHOICE,
  id: 'python:beginner:001',
  level: 'beginner',
  type: 'code',
  code: 'print(1 + 1)',
  q: { tr: 'Bu kod ne yazdırır?', en: 'What does this code print?' },
  options: { tr: ['2', '11', '1 + 1', 'Hata'], en: ['2', '11', '1 + 1', 'Error'] },
};

test('selections must match an area, its topics and its levels', () => {
  assert.equal(isValidSelection({ area: 'general', topic: 'science', level: 'high' }), true);
  assert.equal(isValidSelection({ area: 'general', topic: 'mixed', level: 'masters' }), true);
  assert.equal(isValidSelection({ area: 'software', topic: 'sql', level: 'advanced' }), true);
  assert.equal(isValidSelection({ area: 'software', topic: 'mixed', level: 'advanced' }), false);
  assert.equal(isValidSelection({ area: 'software', topic: 'sql', level: 'high' }), false);
  assert.equal(isValidSelection({ area: 'constructor', topic: 'sql', level: 'high' }), false);
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
    { ...CHOICE, level: 'expert' },
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
  assert.deepEqual(parseRef(makeRef('science:high:001', 42)), { id: 'science:high:001', seed: 42 });
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