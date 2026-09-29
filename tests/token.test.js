import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { seal, open, parseKey, TOKEN_TTL_MS } from '../lib/token.js';

const KEY = randomBytes(32);
const NOW = 1_000_000;
const DATA = { index: 0, questions: [{ ref: 'q1', answer: 2 }] };

test('a sealed token opens to the same data', () => {
  const opened = open(seal(DATA, KEY, NOW), KEY, NOW + 1000);
  assert.deepEqual(opened.data, DATA);
  assert.match(opened.jti, /^[0-9a-f-]{36}$/);
});

test('the same data gives a different token and id every time', () => {
  const first = seal(DATA, KEY, NOW);
  const second = seal(DATA, KEY, NOW);
  assert.notEqual(first, second);
  assert.notEqual(open(first, KEY, NOW).jti, open(second, KEY, NOW).jti);
});

test('the answer cannot be read from the token', () => {
  const token = seal(DATA, KEY, NOW);
  const decoded = Buffer.from(token.slice(3), 'base64url').toString('latin1');
  assert.ok(!decoded.includes('answer'));
});

test('changing a single byte breaks the token', () => {
  const token = seal(DATA, KEY, NOW);
  const raw = Buffer.from(token.slice(3), 'base64url');
  raw[raw.length - 1] ^= 1;
  assert.equal(open(`v1.${raw.toString('base64url')}`, KEY, NOW), null);
});

test('a token only opens with the right key', () => {
  assert.equal(open(seal(DATA, KEY, NOW), randomBytes(32), NOW), null);
});

test('an expired token is refused', () => {
  const token = seal(DATA, KEY, NOW);
  assert.ok(open(token, KEY, NOW + TOKEN_TTL_MS));
  assert.equal(open(token, KEY, NOW + TOKEN_TTL_MS + 1), null);
});

test('garbage input returns null instead of throwing', () => {
  for (const token of [null, 42, '', 'v1.', 'v2.abc', 'v1.abc.def', 'v1.' + 'A'.repeat(20_000)]) {
    assert.equal(open(token, KEY, NOW), null);
  }
});

test('the key must be 32 bytes', () => {
  assert.equal(parseKey(KEY.toString('base64')).length, 32);
  assert.throws(() => parseKey(undefined));
  assert.throws(() => parseKey(randomBytes(16).toString('base64')));
});