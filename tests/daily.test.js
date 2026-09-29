import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, previousDay, isDayKey, DAILY_TIME_ZONE } from '../public/src/dates.js';
import { recordDay, currentStreak, EMPTY_STREAK } from '../public/src/streak.js';
import { dailyShareText, roundShareText } from '../public/src/share.js';

test('the daily question changes at midnight in Istanbul', () => {
  assert.equal(dayKey(new Date('2026-09-29T20:59:00Z'), DAILY_TIME_ZONE), '2026-09-29');
  assert.equal(dayKey(new Date('2026-09-29T21:00:00Z'), DAILY_TIME_ZONE), '2026-09-30');
  assert.equal(dayKey(new Date('2026-09-29T21:00:00Z'), 'UTC'), '2026-09-29');
});

test('previousDay crosses months, years and leap days', () => {
  assert.equal(previousDay('2026-10-01'), '2026-09-30');
  assert.equal(previousDay('2027-01-01'), '2026-12-31');
  assert.equal(previousDay('2028-03-01'), '2028-02-29');
});

test('day keys are validated', () => {
  assert.equal(isDayKey('2026-09-30'), true);
  for (const value of ['2026-9-30', '30.09.2026', null, 20260930, '2026-09-30T00:00']) {
    assert.equal(isDayKey(value), false);
  }
});

test('playing on consecutive days grows the streak', () => {
  let streak = recordDay(EMPTY_STREAK, '2026-09-28');
  streak = recordDay(streak, '2026-09-29');
  streak = recordDay(streak, '2026-09-30');
  assert.deepEqual(streak, { count: 3, best: 3, lastDay: '2026-09-30' });
});

test('playing twice on the same day counts once', () => {
  const streak = recordDay(EMPTY_STREAK, '2026-09-30');
  assert.equal(recordDay(streak, '2026-09-30'), streak);
});

test('a missed day restarts the streak but keeps the best', () => {
  const streak = recordDay({ count: 5, best: 5, lastDay: '2026-09-27' }, '2026-09-30');
  assert.deepEqual(streak, { count: 1, best: 5, lastDay: '2026-09-30' });
});

test('a clock moved back does not break the streak', () => {
  const streak = { count: 4, best: 4, lastDay: '2026-09-30' };
  assert.equal(recordDay(streak, '2026-09-20'), streak);
});

test('the shown streak drops to zero once a day is missed', () => {
  const streak = { count: 4, best: 6, lastDay: '2026-09-29' };
  assert.equal(currentStreak(streak, '2026-09-29'), 4);
  assert.equal(currentStreak(streak, '2026-09-30'), 4);
  assert.equal(currentStreak(streak, '2026-10-01'), 0);
});

test('share texts are short and include the site', () => {
  assert.equal(
    dailyShareText({ lang: 'tr', date: '2026-09-30', correct: true, streak: 5 }),
    'Bilgi Yarışması · Günün sorusu · 30 Eylül 2026\n✅ 🔥5\nquiz.miracdeprem.com',
  );
  assert.equal(
    roundShareText({ lang: 'en', topic: 'geography', level: 'high', results: [true, false, true], score: 38 }),
    'Quiz App · Geography · High School\n🟩🟥🟩 2/3 · 38 points\nquiz.miracdeprem.com',
  );
});
