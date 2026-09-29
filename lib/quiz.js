// Tur kuralları: cevap kontrolü, süre, puan ve jokerler.
// Durum düz bir nesnedir (şifreli jetonun içine girer); her işlem yeni bir durum döndürür.
import { sample } from './random.js';

export const BASE_POINTS = 10;
export const MAX_BONUS = 10;
export const GRACE_MS = 2000;
export const EXTRA_TIME_MS = 10_000;
export const TIME_LIMITS = { choice: 20_000, image: 20_000, code: 40_000, order: 40_000 };

// questions: [{ ref, type, answer, size }]
// order sorusunda answer, öğelerin doğru sırasıdır (ör. [2, 0, 3, 1]).
// jokers: false ise (günün sorusu) iki joker de baştan kullanılmış sayılır.
export function createRound(questions, now, { jokers = true } = {}) {
  return {
    questions,
    index: 0,
    shownAt: now,
    extraTime: 0,
    removed: [],
    jokers: { fifty: !jokers, time: !jokers },
    results: [],
    score: 0,
    finished: false,
  };
}

export function currentQuestion(state) {
  return state.finished ? null : state.questions[state.index];
}

export function timeLimit(state) {
  return TIME_LIMITS[currentQuestion(state).type] + state.extraTime;
}

function isValidChoice(question, choice) {
  if (question.type === 'order') {
    return (
      Array.isArray(choice) &&
      choice.length === question.size &&
      new Set(choice).size === question.size &&
      choice.every((item) => Number.isInteger(item) && item >= 0 && item < question.size)
    );
  }
  return Number.isInteger(choice) && choice >= 0 && choice < question.size;
}

function isCorrect(question, choice) {
  if (question.type === 'order') {
    return choice.every((item, i) => item === question.answer[i]);
  }
  return choice === question.answer;
}

export function speedBonus(elapsed, limit) {
  const remaining = Math.max(0, limit - elapsed);
  return Math.ceil((remaining / limit) * MAX_BONUS);
}

// choice null ise süre doldu demektir. Geçersiz hamlede aynı durum döner.
export function answer(state, choice, now) {
  const question = currentQuestion(state);
  if (!question) return state;
  if (choice !== null && !isValidChoice(question, choice)) return state;

  const elapsed = Math.max(0, now - state.shownAt);
  const limit = timeLimit(state);
  const timedOut = choice === null || elapsed > limit + GRACE_MS;
  const correct = !timedOut && isCorrect(question, choice);
  const points = correct ? BASE_POINTS + speedBonus(elapsed, limit) : 0;
  const index = state.index + 1;

  return {
    ...state,
    index,
    shownAt: now,
    extraTime: 0,
    removed: [],
    results: [
      ...state.results,
      { ref: question.ref, choice: timedOut ? null : choice, correct, timedOut, points },
    ],
    score: state.score + points,
    finished: index === state.questions.length,
  };
}

export function canUseJoker(state, kind, now) {
  const question = currentQuestion(state);
  if (!question || state.jokers[kind] !== false) return false;
  if (now - state.shownAt > timeLimit(state)) return false;
  return kind !== 'fifty' || question.type !== 'order';
}

// fifty: iki yanlış şıkkı kaldırır. time: bu soruya 10 saniye ekler.
export function useJoker(state, kind, now, random) {
  if (!canUseJoker(state, kind, now)) return state;
  const jokers = { ...state.jokers, [kind]: true };
  if (kind === 'time') {
    return { ...state, jokers, extraTime: EXTRA_TIME_MS };
  }
  const question = currentQuestion(state);
  const wrong = [...Array(question.size).keys()].filter((i) => i !== question.answer);
  const removed = sample(random, wrong, 2).sort((a, b) => a - b);
  return { ...state, jokers, removed };
}

export function summary(state) {
  return {
    score: state.score,
    correct: state.results.filter((result) => result.correct).length,
    total: state.questions.length,
    results: state.results,
  };
}