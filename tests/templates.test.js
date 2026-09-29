import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGenerators } from '../lib/generators.js';
import { genitiveTr } from '../lib/templates/shared.js';
import { mulberry32 } from '../lib/random.js';

const country = (id, tr, en, capitalTr, capitalEn, continent, population, tier = 1) => ({
  id, name: { tr, en }, capital: capitalTr ? { tr: capitalTr, en: capitalEn } : null, continent, population, tier,
});
const COUNTRIES = [
  country('JP', 'Japonya', 'Japan', 'Tokyo', 'Tokyo', 'asia', 124),
  country('CN', 'Çin', 'China', 'Pekin', 'Beijing', 'asia', 1410),
  country('KR', 'Güney Kore', 'South Korea', 'Seul', 'Seoul', 'asia', 52),
  country('TH', 'Tayland', 'Thailand', 'Bangkok', 'Bangkok', 'asia', 72),
  country('GB', 'Birleşik Krallık', 'United Kingdom', 'Londra', 'London', 'europe', 68),
  country('TR', 'Türkiye', 'Türkiye', 'Ankara', 'Ankara', null, 85),
  country('ZA', 'Güney Afrika', 'South Africa', null, null, 'africa', 62),
];

const work = (id, kind, title, creator, tier = 1) => ({ id, kind, title: { tr: title, en: title }, creator: { tr: creator, en: creator }, tier });
const WORKS = [
  work('W001', 'book', 'Hamlet', 'William Shakespeare'),
  work('W002', 'book', 'Romeo and Juliet', 'William Shakespeare'),
  work('W003', 'book', '1984', 'George Orwell'),
  work('W004', 'book', 'Les Misérables', 'Victor Hugo'),
  work('W005', 'book', 'Don Quixote', 'Miguel de Cervantes'),
  work('W006', 'film', 'Titanic', 'James Cameron'),
];

const ELEMENTS = [
  ['Au', 'Altın', 'Gold', 79], ['Ag', 'Gümüş', 'Silver', 47], ['Al', 'Alüminyum', 'Aluminium', 13],
  ['Fe', 'Demir', 'Iron', 26], ['O', 'Oksijen', 'Oxygen', 8],
].map(([id, tr, en, number]) => ({ id, name: { tr, en }, number, tier: 1 }));

const generators = createGenerators({ countries: COUNTRIES, works: WORKS, elements: ELEMENTS });

test('Turkish genitive follows the last vowel', () => {
  assert.equal(genitiveTr('Japonya'), "Japonya'nın");
  assert.equal(genitiveTr('Mısır'), "Mısır'ın");
  assert.equal(genitiveTr('Türkiye'), "Türkiye'nin");
  assert.equal(genitiveTr('Peru'), "Peru'nun");
  assert.equal(genitiveTr('Ürdün'), "Ürdün'ün");
  assert.equal(genitiveTr('Nepal'), "Nepal'in");
});

test('capital questions prefer wrong answers from the same continent', () => {
  const question = generators.build('gen:capital:primary:JP', 5, 'tr');
  assert.equal(question.prompt, "Japonya'nın başkenti neresidir?");
  assert.equal(question.options[question.answer], 'Tokyo');
  assert.deepEqual([...question.options].sort(), ['Bangkok', 'Pekin', 'Seul', 'Tokyo']);
});

test('English names get "the" where needed', () => {
  assert.equal(generators.build('gen:capital:primary:GB', 1, 'en').prompt, 'What is the capital of the United Kingdom?');
  assert.equal(generators.build('gen:continent:primary:GB', 1, 'en').explain, 'The United Kingdom is in Europe.');
});

test('countries without a single capital or continent are not asked', () => {
  assert.equal(generators.build('gen:capital:primary:ZA', 1, 'en'), null);
  assert.equal(generators.build('gen:continent:primary:TR', 1, 'en'), null);
});

test('population questions need a big gap', () => {
  const question = generators.build('gen:population:primary:CN.JP.GB.TR', 2, 'en');
  assert.equal(question.options[question.answer], 'China');
  assert.match(question.explain, /^China ≈ 1\.4 billion/);
  assert.equal(generators.build('gen:population:primary:TR.JP.GB.CN', 2, 'en'), null);
});

test('creator questions offer other creators of the same kind', () => {
  const question = generators.build('gen:creator:primary:W003', 4, 'en');
  assert.equal(question.prompt, 'Who wrote “1984”?');
  assert.equal(question.options[question.answer], 'George Orwell');
  assert.ok(!question.options.includes('James Cameron'));
  assert.equal(new Set(question.options).size, 4);
});

test('"by" questions never offer a second work by the same creator', () => {
  for (let seed = 0; seed < 20; seed++) {
    const question = generators.build('gen:by:primary:W001', seed, 'tr');
    assert.equal(question.prompt, 'Hangisi William Shakespeare tarafından yazılmıştır?');
    assert.ok(!question.options.includes('Romeo and Juliet'));
  }
});

test('films are not asked in literature', () => {
  const ids = generators.pick('literature', 'primary', () => 0.99, 10);
  assert.ok(ids.every((id) => !id.endsWith('W006')));
});

test('element questions work both ways', () => {
  const symbol = generators.build('gen:symbol:primary:Au', 3, 'tr');
  assert.equal(symbol.prompt, '“Au” hangi elementin sembolüdür?');
  assert.equal(symbol.options[symbol.answer], 'Altın');
  const element = generators.build('gen:element:primary:Au', 3, 'en');
  assert.equal(element.prompt, 'What is the chemical symbol for gold?');
  assert.equal(element.options[element.answer], 'Au');
  assert.ok(element.options.includes('Ag') && element.options.includes('Al'));
});
test('maths questions are generated for school levels only', () => {
  const random = () => 0.5;
  for (const level of ['primary', 'middle', 'high']) {
    const ids = generators.pick('math', level, mulberry32(7), 10);
    assert.ok(ids.length >= 5, level);
    for (const id of ids) {
      const question = generators.build(id, 1, 'tr');
      assert.equal(new Set(question.options).size, 4, id);
      assert.ok(question.options.every((option) => Number(option) > 0), id);
    }
  }
  assert.deepEqual(generators.pick('math', 'university', random, 5), []);
  assert.equal(generators.build('gen:add:university:12.30', 1, 'en'), null);
});

test('maths answers are right', () => {
  const add = generators.build('gen:add:primary:47.38', 3, 'en');
  assert.equal(add.options[add.answer], '85');
  const percent = generators.build('gen:percent:middle:25.240', 3, 'tr');
  assert.equal(percent.prompt, '240 sayısının %25’i kaçtır?');
  assert.equal(percent.options[percent.answer], '60');
  const equation = generators.build('gen:equation:high:3.5.7', 3, 'en');
  assert.equal(equation.prompt, 'If 3x + 7 = 22, what is x?');
  assert.equal(equation.options[equation.answer], '5');
  assert.equal(generators.build('gen:hypotenuse:high:6.9', 3, 'en'), null);
});

test('flag questions carry the image and never the country code', async () => {
  const { readGeneratedFiles } = await import('../lib/catalog.js');
  const { toPublic } = await import('../lib/questions.js');
  const real = createGenerators(await readGeneratedFiles());
  const ids = real.pick('geography', 'primary', mulberry32(3), 40).filter((id) => id.startsWith('gen:flag:'));
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const question = real.build(id, 9, 'en');
    const view = toPublic(question);
    assert.equal(view.type, 'image');
    assert.match(view.image, /^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(view.image.split(',')[1], 'base64').toString('utf8');
    const code = id.split(':').at(-1).toLowerCase();
    assert.ok(!svg.includes('flag-icons') && !svg.includes(`id="${code}-`), id);
  }
});
