import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashString, randomInt, shuffle, sample } from '../lib/random.js';

const take = (random, n) => Array.from({ length: n }, () => random());

test('same seed gives the same sequence', () => {
  assert.deepEqual(take(mulberry32(42), 5), take(mulberry32(42), 5));
  assert.notDeepEqual(take(mulberry32(42), 5), take(mulberry32(43), 5));
});

test('random values stay in [0, 1)', () => {
  for (const value of take(mulberry32(7), 1000)) {
    assert.ok(value >= 0 && value < 1);
  }
});

test('hashString is stable and spreads nearby dates', () => {
  assert.equal(hashString('2026-09-29'), hashString('2026-09-29'));
  assert.notEqual(hashString('2026-09-29'), hashString('2026-09-30'));
  assert.ok(Number.isInteger(hashString('')) && hashString('abc') >= 0);
});

test('randomInt covers both ends of the range', () => {
  const random = mulberry32(1);
  const seen = new Set(Array.from({ length: 200 }, () => randomInt(random, 1, 4)));
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
});

test('shuffle keeps every item and leaves the input alone', () => {
  const input = [1, 2, 3, 4, 5];
  const result = shuffle(mulberry32(3), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
  assert.deepEqual([...result].sort(), input);
});

test('sample returns distinct items', () => {
  const result = sample(mulberry32(9), ['a', 'b', 'c', 'd', 'e'], 3);
  assert.equal(result.length, 3);
  assert.equal(new Set(result).size, 3);
});