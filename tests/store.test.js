import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, createUpstashStore, createStore } from '../lib/store.js';

function fakeClock(start = 0) {
  let now = start;
  const clock = () => now;
  clock.advance = (ms) => { now += ms; };
  return clock;
}

// Upstash'e giden isteği kaydeder ve hazır bir cevap döndürür.
function fakeFetch(body, status = 200) {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options, commands: JSON.parse(options.body) });
    return { ok: status === 200, status, json: async () => body };
  };
  return { fetchFn, calls };
}

test('memory claim works once until the key expires', async () => {
  const clock = fakeClock();
  const store = createMemoryStore(clock);
  assert.equal(await store.claim('jti:a', 1000), true);
  assert.equal(await store.claim('jti:a', 1000), false);
  assert.equal(await store.claim('jti:b', 1000), true);
  clock.advance(1000);
  assert.equal(await store.claim('jti:a', 1000), true);
});

test('memory hit counts within a window and then resets', async () => {
  const clock = fakeClock();
  const store = createMemoryStore(clock);
  assert.equal(await store.hit('rl:ip', 60_000), 1);
  assert.equal(await store.hit('rl:ip', 60_000), 2);
  clock.advance(60_000);
  assert.equal(await store.hit('rl:ip', 60_000), 1);
});

test('upstash claim sends SET NX with an expiry', async () => {
  const { fetchFn, calls } = fakeFetch([{ result: 'OK' }]);
  const store = createUpstashStore('https://db.upstash.io', 'secret', fetchFn);
  assert.equal(await store.claim('jti:a', 3600), true);
  assert.equal(calls[0].url, 'https://db.upstash.io/pipeline');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
  assert.deepEqual(calls[0].commands, [['SET', 'jti:a', '1', 'PX', '3600', 'NX']]);
});

test('upstash claim returns false when the key already exists', async () => {
  const { fetchFn } = fakeFetch([{ result: null }]);
  assert.equal(await createUpstashStore('u', 't', fetchFn).claim('jti:a', 10), false);
});

test('upstash hit starts the window and returns the count', async () => {
  const { fetchFn, calls } = fakeFetch([{ result: null }, { result: 7 }]);
  assert.equal(await createUpstashStore('u', 't', fetchFn).hit('rl:ip', 60_000), 7);
  assert.deepEqual(calls[0].commands, [
    ['SET', 'rl:ip', '0', 'PX', '60000', 'NX'],
    ['INCR', 'rl:ip'],
  ]);
});

test('upstash failures throw', async () => {
  const failing = fakeFetch([], 500);
  await assert.rejects(createUpstashStore('u', 't', failing.fetchFn).claim('k', 1));
  const erroring = fakeFetch([{ error: 'WRONGTYPE' }]);
  await assert.rejects(createUpstashStore('u', 't', erroring.fetchFn).hit('k', 1));
});

test('createStore picks a store from the environment', () => {
  assert.ok(createStore({ UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' }));
  assert.ok(createStore({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' }));
  assert.ok(createStore({ QUIZ_DEV: '1' }));
  assert.throws(() => createStore({}));
});