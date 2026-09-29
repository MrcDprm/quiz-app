import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATS, MAX_MISTAKES, recordRound, updateMistakes, earnedBadges } from '../public/src/progress.js';

const ROUND = { mode: 'round', area: 'general', topic: 'geography', level: 'high', usedJokers: false };
const results = (correct, total = 10) => Array.from({ length: total }, (_, i) => i < correct);

test('a round adds to the totals and keeps the best score per selection', () => {
  let stats = recordRound(EMPTY_STATS, { ...ROUND, results: results(7), score: 120 });
  stats = recordRound(stats, { ...ROUND, results: results(5), score: 90 });
  assert.equal(stats.rounds, 2);
  assert.equal(stats.answered, 20);
  assert.equal(stats.correct, 12);
  assert.deepEqual(stats.topics, ['general:geography:high']);
  assert.deepEqual(stats.best, { 'general:geography:high': 120 });
});

test('perfect rounds are counted, with and without jokers', () => {
  let stats = recordRound(EMPTY_STATS, { ...ROUND, results: results(10), score: 190, usedJokers: true });
  assert.equal(stats.perfect, 1);
  assert.equal(stats.perfectNoJokers, 0);
  stats = recordRound(stats, { ...ROUND, results: results(10), score: 190 });
  assert.equal(stats.perfectNoJokers, 1);
});

test('the daily question counts answers but not rounds', () => {
  const stats = recordRound(EMPTY_STATS, { mode: 'daily', results: [true], score: 18, usedJokers: true });
  assert.equal(stats.rounds, 0);
  assert.equal(stats.dailyCorrect, 1);
  assert.equal(stats.correct, 1);
  assert.deepEqual(stats.best, {});
});

test('review rounds do not set a best score', () => {
  const stats = recordRound(EMPTY_STATS, { mode: 'review', results: results(3, 3), score: 50, usedJokers: false });
  assert.equal(stats.rounds, 1);
  assert.deepEqual(stats.topics, []);
});

test('mistakes are added, removed when answered right and capped', () => {
  let mistakes = updateMistakes([], [{ id: 'a', correct: false }, { id: 'b', correct: true }, { id: 'c', correct: false }]);
  assert.deepEqual(mistakes, ['a', 'c']);
  mistakes = updateMistakes(mistakes, [{ id: 'a', correct: true }, { id: 'c', correct: false }]);
  assert.deepEqual(mistakes, ['c']);
  const many = Array.from({ length: 150 }, (_, i) => ({ id: `q${i}`, correct: false }));
  const capped = updateMistakes([], many);
  assert.equal(capped.length, MAX_MISTAKES);
  assert.equal(capped[0], 'q50');
});

test('badges follow the stats and the best streak', () => {
  assert.deepEqual(earnedBadges(EMPTY_STATS, { best: 0 }), []);
  const stats = recordRound(EMPTY_STATS, { ...ROUND, level: 'masters', results: results(10), score: 200 });
  assert.deepEqual(earnedBadges(stats, { best: 7 }), ['firstRound', 'perfect', 'noJokers', 'streak3', 'streak7', 'masters']);
  const explorer = { ...EMPTY_STATS, topics: ['general:math:high', 'general:science:high', 'general:history:high', 'general:geography:high', 'software:sql:high'] };
  assert.ok(earnedBadges(explorer, { best: 0 }).includes('explorer'));
});
