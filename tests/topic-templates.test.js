// Spor, sinema-müzik, nehir, dağ, tarihî olay ve buluş şablonları; gerçek veri dosyalarıyla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGenerators } from '../lib/generators.js';
import { readGeneratedFiles } from '../lib/catalog.js';
import { mulberry32 } from '../lib/random.js';
import { sportTier } from '../lib/templates/sport.js';
import { centuryOf, centuryText } from '../lib/templates/events.js';
import { TOPIC_GROUPS } from '../lib/templates/people.js';

const data = await readGeneratedFiles();
const generators = createGenerators(data);
const DIFFICULTIES = ['easy', 'medium', 'hard'];

/** Konudaki şablon sorularından, verilen şablon adına uyanlar (her zorlukta, birkaç tohumla). */
function questionsOf(topic, template, lang = 'tr') {
  const questions = [];
  for (let seed = 1; seed <= 6; seed++) {
    for (const difficulty of DIFFICULTIES) {
      for (const id of generators.pick(topic, difficulty, mulberry32(seed), 30)) {
        if (id.split(':')[1] === template) questions.push({ id, question: generators.build(id, seed, lang) });
      }
    }
  }
  return questions;
}

const correctOf = ({ options, answer }) => options[answer];

test('every new dataset loads without skipped items', () => {
  assert.equal(data.sport.length, 52);
  assert.ok(data.rivers.length >= 80);
  assert.equal(data.mountains.length, 28);
  assert.equal(data.events.length, 44);
  assert.equal(data.discoveries.length, 30);
});

test('recent tournaments are easy, early ones hard', () => {
  assert.equal(sportTier({ kind: 'worldcup', year: 2022 }), 1);
  assert.equal(sportTier({ kind: 'worldcup', year: 1986 }), 2);
  assert.equal(sportTier({ kind: 'worldcup', year: 1930 }), 4);
  assert.equal(sportTier({ kind: 'olympics', year: 1896 }), 4);
});

test('World Cup winner: one champion, other options are different teams', () => {
  const questions = questionsOf('sport', 'cupwinner', 'en');
  assert.ok(questions.length > 5);
  for (const { id, question } of questions) {
    assert.equal(new Set(question.options).size, 4, id);
    // Almanya ile Batı Almanya aynı takım sayılır
    const germanies = question.options.filter((option) => /Germany/.test(option));
    assert.ok(germanies.length <= 1, id);
  }
});

test('World Cup host: no co-hosted cup, no "Germany" next to "West Germany"', () => {
  const questions = questionsOf('sport', 'cuphost', 'en');
  assert.ok(questions.length > 5);
  for (const { id, question } of questions) {
    assert.ok(!id.endsWith('WC2002'), id);
    assert.ok(question.options.filter((option) => /Germany/.test(option)).length <= 1, id);
  }
});

test('"Which of these is …" in sport and film asks only that family', () => {
  for (const [topic, groups] of Object.entries(TOPIC_GROUPS)) {
    for (const { id, question } of questionsOf(topic, 'which', 'en')) {
      assert.ok(groups.some((group) => question.prompt.includes(group === 'basketball' ? 'basketball' : group)), `${id}: ${question.prompt}`);
    }
  }
});

test('the history era question leaves out sports and entertainment people', () => {
  const famous = new Map(data.people.map((person) => [person.name.en, person]));
  for (const { id, question } of questionsOf('history', 'era', 'en')) {
    for (const name of question.items) {
      const groups = famous.get(name)?.groups ?? [];
      assert.ok(!groups.some((group) => ['footballer', 'basketball', 'tennis', 'actor', 'singer', 'director'].includes(group)), `${id}: ${name}`);
    }
  }
});

test('longest river and highest mountain are clearly the largest', () => {
  for (const [template, dataset, measure, ratio] of [['river', 'rivers', 'km', 1.3], ['peak', 'mountains', 'm', 1.15]]) {
    const byName = new Map(data[dataset].map((item) => [item.name.en, item]));
    const questions = questionsOf('geography', template, 'en');
    assert.ok(questions.length > 3, template);
    for (const { id, question } of questions) {
      const values = question.options.map((name) => byName.get(name)[measure]);
      const best = byName.get(correctOf(question))[measure];
      assert.ok(values.every((value) => value === best || value * ratio <= best), id);
    }
  }
});

test('mountains on a border are never asked by country', () => {
  for (const { id } of questionsOf('geography', 'peakcountry')) {
    assert.ok(!/everest|k2|kangchenjunga|montblanc|matterhorn/.test(id), id);
  }
});

test('events to order are at least 30 years apart', () => {
  const years = new Map(data.events.map((event) => [event.name.en, event.year]));
  for (const { id, question } of questionsOf('history', 'events', 'en')) {
    const ordered = question.answer.map((index) => years.get(question.items[index]));
    ordered.slice(1).forEach((year, i) => assert.ok(year - ordered[i] >= 30, id));
  }
});

test('century questions offer the right century and its closest neighbours', () => {
  assert.equal(centuryOf(1453), 15);
  assert.equal(centuryOf(1900), 19);
  assert.equal(centuryOf(2001), 21);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map((value) => centuryText(value, 'en')), [
    '1st century', '2nd century', '3rd century', '4th century', '11th century', '12th century', '13th century', '21st century', '22nd century',
  ]);
  assert.equal(centuryText(15, 'tr'), '15. yüzyıl');
  for (const { id, question } of questionsOf('history', 'century', 'en')) {
    const numbers = question.options.map((option) => Number.parseInt(option, 10));
    const right = numbers[question.answer];
    assert.equal(new Set(numbers).size, 4, id);
    assert.ok(numbers.every((value) => Math.abs(value - right) <= 3 && value >= 1 && value <= 21), id);
  }
});

test('a discovery question never offers the same person twice', () => {
  const questions = questionsOf('science', 'discovery', 'en');
  assert.ok(questions.length > 5);
  for (const { id, question } of questions) assert.equal(new Set(question.options).size, 4, id);
});
