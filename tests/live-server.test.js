// Birlikte oynama sunucusu uçtan uca: gerçek HTTP sunucusu rastgele bir portta açılır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveServer, LIMITS } from '../live/server.js';
import { createQuestionLoader } from '../live/questions.js';

const ORIGIN = 'https://quiz.test';
const QUESTIONS = Array.from({ length: 5 }, (_, i) => ({ type: 'choice', prompt: `Soru ${i}`, options: ['a', 'b', 'c', 'd'], answer: 2, explain: 'x' }));

async function start(t) {
  const live = createLiveServer({ origins: [ORIGIN], loadQuestions: async ({ count }) => QUESTIONS.slice(0, count) });
  await new Promise((resolve) => live.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => live.close(resolve)));
  const base = `http://127.0.0.1:${live.server.address().port}`;
  const call = async (path, body, { origin = ORIGIN, method = 'POST', ip } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { ...(origin && { origin }), 'content-type': 'application/json', ...(ip && { 'x-forwarded-for': ip }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
  };
  return { base, call };
}

/** Olay akışını açar; next() sıradaki "data:" mesajını (JSON) verir. */
async function events(base, code, token) {
  const controller = new AbortController();
  const response = await fetch(`${base}/rooms/${code}/events?token=${encodeURIComponent(token)}`, { headers: { origin: ORIGIN }, signal: controller.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    response,
    async next() {
      for (;;) {
        const end = buffer.indexOf('\n\n');
        if (end !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block.split('\n').find((line) => line.startsWith('data: '));
          if (data) return JSON.parse(data.slice(6));
          continue;
        }
        const { done, value } = await reader.read();
        if (done) return null;
        buffer += decoder.decode(value, { stream: true });
      }
    },
    close: () => controller.abort(),
  };
}

const ROOM = { area: 'general', topic: 'history', difficulty: 'easy', lang: 'tr', settings: { count: 5 }, name: 'Moderatör' };

test('health check, origin allow-list and preflight', async (t) => {
  const { base, call } = await start(t);
  assert.equal(await (await fetch(`${base}/health`)).text(), 'ok');
  assert.equal((await call('/rooms', ROOM, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('/rooms', ROOM, { origin: null })).status, 403);
  const preflight = await fetch(`${base}/rooms`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
});

test('create, join, stream, play a question and see the result', async (t) => {
  const { base, call } = await start(t);
  const created = await call('/rooms', ROOM);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('access-control-allow-origin'), ORIGIN);
  const { code, token: host } = created.body;
  const joined = await call(`/rooms/${code}/join`, { name: 'Ayşe' });
  assert.equal(joined.status, 200);
  const player = joined.body.token;

  const stream = await events(base, code, player);
  assert.equal(stream.response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const lobby = await stream.next();
  assert.equal(lobby.phase, 'lobby');
  assert.equal(lobby.role, 'player');
  assert.deepEqual(lobby.players.map((item) => item.name).sort(), ['Ayşe', 'Moderatör']);

  assert.equal((await call(`/rooms/${code}/command`, { token: player, action: 'start' })).status, 403);
  assert.equal((await call(`/rooms/${code}/command`, { token: host, action: 'start' })).status, 200);
  const question = await stream.next();
  assert.equal(question.phase, 'question');
  assert.equal(question.question.prompt, 'Soru 0');
  assert.equal(question.question.answer, undefined);

  assert.equal((await call(`/rooms/${code}/answer`, { token: player, choice: 2 })).status, 200);
  assert.equal((await call(`/rooms/${code}/answer`, { token: player, choice: 2 })).body.error, 'already_answered');
  await stream.next(); // cevabın kaydı
  await call(`/rooms/${code}/answer`, { token: host, choice: 0 });
  const result = await stream.next();
  assert.equal(result.phase, 'reveal');
  assert.equal(result.question.answer, 2);
  assert.equal(result.you.last.correct, true);
  stream.close();
});

test('bad requests get short error codes, never details', async (t) => {
  const { call } = await start(t);
  assert.equal((await call('/rooms', { ...ROOM, topic: 'nope' })).body.error, 'bad_request');
  assert.equal((await call('/rooms', { ...ROOM, lang: 'de' })).body.error, 'bad_request');
  assert.equal((await call('/rooms', { ...ROOM, name: '<b>' })).body.error, 'bad_name');
  assert.equal((await call('/rooms/123456/join', { name: 'Ali' })).status, 404);
  assert.equal((await call('/rooms/abc/join', { name: 'Ali' })).status, 404);
  assert.equal((await call('/rooms/123456/events', undefined, { method: 'GET' })).status, 404);
  const raw = await call('/rooms', undefined);
  assert.equal(raw.body.error, 'bad_request');
});

test('a removed player\'s stream is closed', async (t) => {
  const { base, call } = await start(t);
  const { code, token: host } = (await call('/rooms', ROOM)).body;
  const player = (await call(`/rooms/${code}/join`, { name: 'Ali' })).body.token;
  const stream = await events(base, code, player);
  const lobby = await stream.next();
  const id = lobby.you.id;
  await call(`/rooms/${code}/command`, { token: host, action: 'kick', target: id });
  assert.deepEqual(await stream.next(), {}); // "gone" olayı: odadan çıkarıldın
  assert.equal(await stream.next(), null); // akış bitti
  assert.equal((await call(`/rooms/${code}/answer`, { token: player, choice: 0 })).status, 404);
});

test('creating rooms is rate limited per address', async (t) => {
  const { call } = await start(t);
  const [limit] = LIMITS.create;
  for (let i = 0; i < limit; i++) assert.equal((await call('/rooms', ROOM, { ip: '9.9.9.9' })).status, 201);
  assert.equal((await call('/rooms', ROOM, { ip: '9.9.9.9' })).status, 429);
  assert.equal((await call('/rooms', ROOM, { ip: '8.8.8.8' })).status, 201);
});

test('the question loader uses the real catalog and leaves out ordering questions', async () => {
  const load = createQuestionLoader();
  const questions = await load({ area: 'general', topic: 'history', difficulty: 'medium', lang: 'tr', count: 10 });
  assert.equal(questions.length, 10);
  assert.ok(questions.every((question) => question.type !== 'order' && question.options.length === 4 && Number.isInteger(question.answer)));
  assert.deepEqual(await load({ area: 'general', topic: 'history', difficulty: 'expert', lang: 'tr', count: 5 }), []);
  assert.deepEqual(await load({ area: 'general', topic: 'history', difficulty: 'easy', lang: 'de', count: 5 }), []);
});
