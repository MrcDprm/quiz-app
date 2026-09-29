import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../lib/store.js';
import {
  json, fail, isSameOrigin, clientIp, readJson, pick, oneOf, endpoint, RATE_LIMIT,
} from '../lib/http.js';

const HOST = 'quiz.miracdeprem.com';

function post(body, headers = {}) {
  return new Request(`https://${HOST}/api/test`, {
    method: 'POST',
    headers: {
      host: HOST,
      origin: `https://${HOST}`,
      'content-type': 'application/json',
      'x-forwarded-for': '1.2.3.4',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('json responses are never cached', async () => {
  const response = json({ ok: true }, 201);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(await fail(400, 'bad_request').json(), { error: 'bad_request' });
});

test('only requests from the same site pass the origin check', () => {
  assert.equal(isSameOrigin(post({})), true);
  assert.equal(isSameOrigin(post({}, { origin: 'https://evil.example' })), false);
  assert.equal(isSameOrigin(post({}, { origin: 'null' })), false);
});

test('the client ip is the first forwarded address', () => {
  assert.equal(clientIp(post({}, { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' })), '9.9.9.9');
  assert.equal(clientIp(new Request('https://x.test')), 'unknown');
});

test('readJson accepts only small json objects', async () => {
  assert.deepEqual(await readJson(post({ a: 1 })), { a: 1 });
  assert.equal(await readJson(post('{broken')), null);
  assert.equal(await readJson(post('[1,2]')), null);
  assert.equal(await readJson(post('null')), null);
  assert.equal(await readJson(post({ a: 1 }, { 'content-type': 'text/plain' })), null);
  assert.equal(await readJson(post({ big: 'x'.repeat(5000) })), null);
});

test('pick keeps only allowed and valid fields', () => {
  const schema = { lang: oneOf('tr', 'en'), level: oneOf('lise') };
  assert.deepEqual(pick({ lang: 'tr', level: 'lise', admin: true }, schema), { lang: 'tr', level: 'lise' });
  assert.equal(pick({ lang: 'de', level: 'lise' }, schema), null);
  assert.equal(pick({ lang: 'tr' }, schema), null);
  assert.equal(pick(JSON.parse('{"__proto__": {"x": 1}, "lang": "tr", "level": "lise"}'), schema).x, undefined);
});

test('endpoint blocks other origins', async () => {
  const handler = endpoint(async () => json({ ok: true }), { getStore: createMemoryStore });
  assert.equal((await handler(post({}, { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await handler(post({}))).status, 200);
});

test('endpoint rate limits each ip', async () => {
  const store = createMemoryStore();
  const handler = endpoint(async () => json({ ok: true }), { getStore: () => store });
  for (let i = 0; i < RATE_LIMIT; i++) {
    assert.equal((await handler(post({}))).status, 200);
  }
  assert.equal((await handler(post({}))).status, 429);
  assert.equal((await handler(post({}, { 'x-forwarded-for': '5.6.7.8' }))).status, 200);
});

test('endpoint hides unexpected errors from the user', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const handler = endpoint(async () => { throw new Error('secret detail'); }, { getStore: createMemoryStore });
  const response = await handler(post({}));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'server_error' });
  assert.equal(logged.mock.callCount(), 1);
});