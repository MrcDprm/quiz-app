import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../lib/random.js';
import { createGenerators } from '../lib/generators.js';
import { GROUP_LABELS } from '../lib/templates/people.js';
import { readGeneratedFiles } from '../lib/catalog.js';

const person = (id, tr, en, born, groups, fame = 250) => ({ id, name: { tr, en }, born, groups, fame });

const PEOPLE = [
  person('Q1', 'Aristoteles', 'Aristotle', -384, ['philosopher']),
  person('Q2', 'Leonardo da Vinci', 'Leonardo da Vinci', 1452, ['painter', 'scientist']),
  person('Q3', 'Isaac Newton', 'Isaac Newton', 1643, ['scientist', 'philosopher']),
  person('Q4', 'Napolyon', 'Napoleon', 1769, ['politician']),
  person('Q5', 'Lionel Messi', 'Lionel Messi', 1987, ['footballer']),
  person('Q6', 'Vincent van Gogh', 'Vincent van Gogh', 1853, ['painter']),
  person('Q7', 'Mozart', 'Mozart', 1756, ['composer']),
];

const generators = createGenerators({ people: PEOPLE });

test('"who" asks what a person is known for, with one right answer', () => {
  const question = generators.build('gen:who:primary:Q4', 42, 'tr');
  assert.equal(question.prompt, 'Napolyon en çok hangi alanda tanınır?');
  assert.equal(question.options[question.answer], 'Siyasetçi');
  assert.equal(new Set(question.options).size, 4);
  assert.equal(question.id, 'gen:who:primary:Q4');
});

test('"who" never offers another of the person\'s fields as a wrong answer', () => {
  const labels = ['Bilim insanı', 'Filozof'];
  for (let seed = 0; seed < 30; seed++) {
    const question = generators.build('gen:who:primary:Q1', seed, 'tr');
    const wrong = question.options.filter((_, i) => i !== question.answer);
    assert.ok(!wrong.includes('Filozof'));
    assert.ok(labels.includes(question.options[question.answer]));
  }
});

test('"who" is only built for people with a single field', () => {
  assert.equal(generators.build('gen:who:primary:Q3', 1, 'en'), null);
});

test('"which" has exactly one person from the asked field', () => {
  for (let seed = 0; seed < 30; seed++) {
    const question = generators.build('gen:which:primary:Q6', seed, 'en');
    assert.equal(question.prompt, 'Which of these people is a painter or sculptor?');
    assert.equal(question.options[question.answer], 'Vincent van Gogh');
    assert.ok(!question.options.includes('Leonardo da Vinci'));
  }
});

test('"era" orders people who lived at least a century apart', () => {
  const question = generators.build('gen:era:primary:Q5.Q1.Q4.Q2', 3, 'en');
  assert.equal(question.type, 'order');
  assert.deepEqual(question.answer.map((i) => question.items[i]), ['Aristotle', 'Leonardo da Vinci', 'Napoleon', 'Lionel Messi']);
  assert.equal(question.explain, 'Aristotle (384 BC), Leonardo da Vinci (1452), Napoleon (1769), Lionel Messi (1987)');
  assert.match(generators.build('gen:era:primary:Q5.Q1.Q4.Q2', 3, 'tr').explain, /^Aristoteles \(MÖ 384\)/);
  assert.equal(generators.build('gen:era:primary:Q1.Q2.Q4.Q7', 3, 'en'), null);
});

test('the same id and seed always build the same question', () => {
  assert.deepEqual(generators.build('gen:which:primary:Q5', 9, 'tr'), generators.build('gen:which:primary:Q5', 9, 'tr'));
});

test('unknown or malformed ids give null', () => {
  for (const id of ['gen:who:primary:Q99', 'gen:nope:primary:Q4', 'gen:who:expert:Q4', 'gen:who:primary:4', 'gen:who:primary:Q4.Q5.Q6.Q7.Q1', 'gen:constructor:primary:Q4']) {
    assert.equal(generators.build(id, 1, 'en'), null);
  }
});

test('pick follows the topic and level', () => {
  const ids = generators.pick('general', 'primary', mulberry32(1), 5);
  assert.ok(ids.length > 0 && ids.length <= 5);
  assert.ok(ids.every((id) => /^gen:(who|which|era):primary:/.test(id)));
  assert.ok(generators.pick('history', 'primary', mulberry32(1), 5).every((id) => id.startsWith('gen:era:')));
  assert.deepEqual(generators.pick('science', 'primary', mulberry32(1), 5), []);
  assert.deepEqual(generators.pick('general', 'beginner', mulberry32(1), 5), []);
});

test('invalid people are skipped', (t) => {
  t.mock.method(console, 'warn', () => {});
  const broken = createGenerators({ people: [...PEOPLE, { id: 'X', name: {}, born: 'old', groups: ['wizard'] }] });
  assert.equal(broken.build('gen:who:primary:Q4', 1, 'en').options.length, 4);
});

test('the real data builds clean questions for every topic and level', async () => {
  const real = createGenerators(await readGeneratedFiles());
  const random = mulberry32(2026);
  for (const topic of ['general', 'history', 'geography', 'literature', 'science']) {
    for (const level of ['primary', 'middle', 'high', 'university', 'masters']) {
      const ids = real.pick(topic, level, random, 20);
      assert.ok(ids.length >= 5, `too few questions for ${topic}/${level}`);
      for (const id of ids) {
        for (const lang of ['tr', 'en']) {
          const question = real.build(id, 7, lang);
          const choices = question.options ?? question.items;
          assert.equal(new Set(choices).size, 4, id);
          assert.ok(question.prompt && question.explain, id);
        }
      }
    }
  }
  assert.ok(Object.keys(GROUP_LABELS).length >= 10);
});

test('generated questions already seen are not produced again', async () => {
  const real = createGenerators(await readGeneratedFiles());
  const first = real.pick('geography', 'high', mulberry32(1), 10);
  const second = real.pick('geography', 'high', mulberry32(1), 10, new Set(first));
  assert.equal(second.length, 10);
  assert.ok(second.every((id) => !first.includes(id)));
});
