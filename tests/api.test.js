import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createApi } from '../lib/api.js';
import { createCatalog } from '../lib/catalog.js';
import { createMemoryStore } from '../lib/store.js';
import { open } from '../lib/token.js';
import { mulberry32 } from '../lib/random.js';

const HOST = 'quiz.test';
const KEY = randomBytes(32);

function question(id, answerText) {
  return {
    id,
    level: 'high',
    type: 'choice',
    q: { tr: `Soru ${id}`, en: `Question ${id}` },
    options: { tr: [answerText, 'b', 'c', 'd'], en: [answerText, 'b', 'c', 'd'] },
    explain: { tr: 'Açıklama', en: 'Explanation' },
  };
}

const FILES = {
  science: { questions: [question('science:high:001', 'right'), question('science:high:002', 'right')] },
  general: { questions: [{ ...question('general:middle:001', 'right'), level: 'middle' }] },
};

// Her test kendi saatini, deposunu ve API'sini kurar.
function setup() {
  let now = 1_000_000;
  const clock = () => now;
  clock.advance = (ms) => { now += ms; };
  const store = createMemoryStore(clock);
  const api = createApi({
    catalog: createCatalog(async (topic) => FILES[topic] ?? { questions: [] }, async () => ({ people: [] })),
    getStore: () => store,
    getKey: () => KEY,
    now: clock,
    newRandom: () => mulberry32(7),
  });
  return { api, clock };
}

function post(body) {
  return new Request(`https://${HOST}/api/x`, {
    method: 'POST',
    headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const START = { area: 'general', topic: 'science', level: 'high', lang: 'en' };

// Test, jetonun içini anahtarla açarak doğru cevabı öğrenir (tarayıcı bunu yapamaz).
const answerOf = (token) => {
  const { state } = open(token, KEY, 0).data;
  return state.questions[state.index].answer;
};

async function call(handler, body) {
  const response = await handler(post(body));
  return { status: response.status, body: await response.json() };
}

test('a round starts with a question that has no answer in it', async () => {
  const { api } = setup();
  const { status, body } = await call(api.round, START);
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body.question).sort(), ['index', 'options', 'prompt', 'removed', 'size', 'timeLimit', 'total', 'type']);
  assert.equal(body.question.total, 2);
  assert.equal(body.score, 0);
});

test('bad round requests are refused', async () => {
  const { api } = setup();
  assert.equal((await call(api.round, { ...START, level: 'expert' })).status, 400);
  assert.equal((await call(api.round, { ...START, lang: 'de' })).status, 400);
  assert.equal((await call(api.round, { area: 'general' })).status, 400);
  assert.equal((await call(api.round, { ...START, topic: 'history' })).status, 404);
});

test('a correct answer reveals the result and the next question', async () => {
  const { api } = setup();
  const round = await call(api.round, START);
  const { status, body } = await call(api.answer, { token: round.body.token, choice: answerOf(round.body.token) });
  assert.equal(status, 200);
  assert.equal(body.result.correct, true);
  assert.equal(body.result.points, 20);
  assert.equal(body.result.explain, 'Explanation');
  assert.match(body.result.id, /^science:high:00[12]$/);
  assert.equal(body.question.index, 1);
  assert.notEqual(body.token, round.body.token);
});

test('a token cannot be used twice', async () => {
  const { api } = setup();
  const round = await call(api.round, START);
  assert.equal((await call(api.answer, { token: round.body.token, choice: 0 })).status, 200);
  assert.equal((await call(api.answer, { token: round.body.token, choice: 1 })).status, 409);
});

test('tampered tokens and bad choices are refused', async () => {
  const { api } = setup();
  const round = await call(api.round, START);
  const tampered = round.body.token.slice(0, -2) + (round.body.token.endsWith('AA') ? 'BB' : 'AA');
  assert.equal((await call(api.answer, { token: tampered, choice: 0 })).status, 400);
  assert.equal((await call(api.answer, { token: round.body.token, choice: 9 })).status, 400);
  assert.equal((await call(api.answer, { token: round.body.token, choice: '0' })).status, 400);
  assert.equal((await call(api.answer, { token: round.body.token, choice: 0 })).status, 200);
});

test('the server decides when time is up', async () => {
  const { api, clock } = setup();
  const round = await call(api.round, START);
  clock.advance(30_000);
  const { body } = await call(api.answer, { token: round.body.token, choice: answerOf(round.body.token) });
  assert.equal(body.result.correct, false);
  assert.equal(body.result.timedOut, true);
});

test('the last answer ends the round with a summary', async () => {
  const { api } = setup();
  let token = (await call(api.round, START)).body.token;
  let body;
  for (let i = 0; i < 2; i++) {
    ({ body } = await call(api.answer, { token, choice: answerOf(token) }));
    token = body.token;
  }
  assert.deepEqual(body.summary, { score: 40, correct: 2, total: 2 });
  assert.equal(body.token, undefined);
  assert.equal(body.question, undefined);
});

test('50:50 removes two wrong options and gives a new token', async () => {
  const { api } = setup();
  const round = await call(api.round, START);
  const correct = answerOf(round.body.token);
  const { status, body } = await call(api.joker, { token: round.body.token, kind: 'fifty' });
  assert.equal(status, 200);
  assert.equal(body.removed.length, 2);
  assert.ok(!body.removed.includes(correct));
  assert.equal((await call(api.joker, { token: body.token, kind: 'fifty' })).status, 400);
  assert.equal((await call(api.joker, { token: round.body.token, kind: 'time' })).status, 409);
});

test('extra time raises the time limit', async () => {
  const { api } = setup();
  const round = await call(api.round, START);
  const { body } = await call(api.joker, { token: round.body.token, kind: 'time' });
  assert.equal(body.timeLimit, round.body.question.timeLimit + 10_000);
});
test('everyone gets the same daily question, in their own language', async () => {
  const { api } = setup();
  const first = await call(api.daily, { lang: 'en' });
  const second = await call(api.daily, { lang: 'tr' });
  assert.equal(first.status, 200);
  assert.match(first.body.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(first.body.question.total, 1);
  assert.equal(first.body.question.prompt, second.body.question.prompt.replace('Soru', 'Question'));
  assert.equal(answerOf(first.body.token), answerOf(second.body.token));
});

test('the daily question has no jokers', async () => {
  const { api } = setup();
  const daily = await call(api.daily, { lang: 'en' });
  assert.equal((await call(api.joker, { token: daily.body.token, kind: 'fifty' })).status, 400);
  assert.equal((await call(api.daily, { lang: 'de' })).status, 400);
});

test('a review round asks the saved questions again', async () => {
  const { api } = setup();
  const { status, body } = await call(api.review, { ids: ['science:high:001', 'science:high:999', 'gen:who:high:Q1'], lang: 'en' });
  assert.equal(status, 200);
  assert.equal(body.question.total, 1);
  const answered = await call(api.answer, { token: body.token, choice: answerOf(body.token) });
  assert.equal(answered.body.result.id, 'science:high:001');
});

test('review requests are validated', async () => {
  const { api } = setup();
  assert.equal((await call(api.review, { ids: [], lang: 'en' })).status, 400);
  assert.equal((await call(api.review, { ids: Array(11).fill('science:high:001'), lang: 'en' })).status, 400);
  assert.equal((await call(api.review, { ids: ['science:high:001~5'], lang: 'en' })).status, 400);
  assert.equal((await call(api.review, { ids: ['nope:high:001'], lang: 'en' })).status, 404);
});

test('a round avoids questions the player has already seen', async () => {
  const { api } = setup();
  const fresh = await call(api.round, { ...START, seen: ['science:high:001'] });
  assert.equal(fresh.body.question.total, 2);
  assert.equal(fresh.body.recycled, true);
  const none = await call(api.round, { ...START, seen: [] });
  assert.equal(none.body.recycled, false);
  assert.equal((await call(api.round, { ...START, seen: 'nope' })).status, 400);
  assert.equal((await call(api.round, { ...START, seen: Array(51).fill('science:high:001') })).status, 400);
});
