import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../lib/random.js';
import {
  createRound, answer, useJoker, canUseJoker, summary, currentQuestion, GRACE_MS,
} from '../lib/quiz.js';

const START = 1_000_000;
const QUESTIONS = [
  { ref: 'q1', type: 'choice', answer: 2, size: 4 },
  { ref: 'q2', type: 'order', answer: [3, 1, 0, 2], size: 4 },
  { ref: 'q3', type: 'code', answer: 0, size: 4 },
];
const newRound = () => createRound(QUESTIONS, START);

test('a fast correct answer earns full points and moves on', () => {
  const state = answer(newRound(), 2, START + 500);
  assert.equal(state.score, 20);
  assert.equal(state.index, 1);
  assert.equal(state.shownAt, START + 500);
  assert.deepEqual(state.results[0], { ref: 'q1', choice: 2, correct: true, timedOut: false, points: 20 });
});

test('the speed bonus shrinks as time passes', () => {
  assert.equal(answer(newRound(), 2, START + 10_000).score, 15);
  assert.equal(answer(newRound(), 2, START + 20_000).score, 10);
});

test('a wrong answer scores nothing', () => {
  const state = answer(newRound(), 0, START + 1000);
  assert.equal(state.score, 0);
  assert.equal(state.results[0].correct, false);
});

test('invalid choices return the same state', () => {
  const state = newRound();
  for (const choice of [4, -1, 1.5, '2', [2], undefined]) {
    assert.equal(answer(state, choice, START), state);
  }
});

test('null means the timer ran out', () => {
  const result = answer(newRound(), null, START + 20_000).results[0];
  assert.equal(result.timedOut, true);
  assert.equal(result.correct, false);
});

test('late answers are wrong unless within the grace period', () => {
  assert.equal(answer(newRound(), 2, START + 20_000 + GRACE_MS).score, 10);
  const late = answer(newRound(), 2, START + 20_001 + GRACE_MS).results[0];
  assert.equal(late.correct, false);
  assert.equal(late.timedOut, true);
});

test('order questions need the exact order and a real permutation', () => {
  const second = answer(newRound(), 2, START);
  assert.equal(answer(second, [3, 1, 0, 2], START + 1000).results[1].correct, true);
  assert.equal(answer(second, [1, 3, 0, 2], START + 1000).results[1].correct, false);
  assert.equal(answer(second, [3, 3, 0, 2], START), second);
  assert.equal(answer(second, [3, 1, 0], START), second);
});

test('the round finishes after the last question', () => {
  let state = newRound();
  state = answer(state, 2, START);
  state = answer(state, [3, 1, 0, 2], START);
  state = answer(state, 0, START);
  assert.equal(state.finished, true);
  assert.equal(currentQuestion(state), null);
  assert.equal(answer(state, 0, START), state);
  assert.deepEqual(summary(state), { score: 60, correct: 3, total: 3, results: state.results });
});

test('50:50 removes two wrong options once per round', () => {
  const state = useJoker(newRound(), 'fifty', START, mulberry32(1));
  assert.equal(state.removed.length, 2);
  assert.ok(!state.removed.includes(2));
  assert.equal(canUseJoker(state, 'fifty', START), false);
  assert.deepEqual(answer(state, 2, START).removed, []);
});

test('50:50 is not allowed on order questions', () => {
  const second = answer(newRound(), 2, START);
  assert.equal(useJoker(second, 'fifty', START, mulberry32(1)), second);
});

test('extra time extends the current question only', () => {
  const state = useJoker(newRound(), 'time', START + 5000, mulberry32(1));
  assert.equal(answer(state, 2, START + 25_000).results[0].correct, true);
  assert.equal(answer(state, 2, START).extraTime, 0);
});

test('jokers are refused after time is up or for unknown kinds', () => {
  const state = newRound();
  assert.equal(useJoker(state, 'time', START + 20_001, mulberry32(1)), state);
  assert.equal(useJoker(state, 'constructor', START, mulberry32(1)), state);
});

test('actions never change the previous state', () => {
  const state = newRound();
  const copy = structuredClone(state);
  answer(state, 2, START);
  useJoker(state, 'fifty', START, mulberry32(1));
  assert.deepEqual(state, copy);
});