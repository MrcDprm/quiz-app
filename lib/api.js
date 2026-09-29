// API uçlarının işi: isteği doğrula, jetonu aç, kuralı uygula, yeni jetonla yanıtla.
// Bağımlılıklar (katalog, depo, anahtar, saat) dışarıdan verilir; testler sahtelerini kullanır.
import { webcrypto } from 'node:crypto';
import { LANGS, isValidSelection } from '../public/src/topics.js';
import { DAILY_TIME_ZONE, dayKey } from '../public/src/dates.js';
import { endpoint, readJson, pick, oneOf, json, fail } from './http.js';
import { createRound, answer, useJoker, currentQuestion, timeLimit } from './quiz.js';
import { seal, open, TOKEN_TTL_MS } from './token.js';
import { toPublic } from './questions.js';
import { mulberry32, hashString } from './random.js';


export const ROUND_SIZE = 10;

// Günün sorusu herkes için aynı havuzdan, aynı tohumla seçilir: genel kültür, ortaokul seviyesi.
const DAILY_SELECTION = { area: 'general', topic: 'general', level: 'middle' };

const isString = (value) => typeof value === 'string';
const isChoice = (value) => value === null || Number.isInteger(value) || Array.isArray(value);

// Her istek için tahmin edilemez bir tohum.
function secureRandom() {
  return mulberry32(webcrypto.getRandomValues(new Uint32Array(1))[0]);
}

export function createApi({ catalog, getStore, getKey, now = Date.now, newRandom = secureRandom }) {
  // Sıradaki sorunun tarayıcıya gidecek hâli: cevap ve açıklama yok.
  async function questionView(state, lang) {
    const question = await catalog.resolve(currentQuestion(state).ref, lang);
    return {
      ...toPublic(question),
      index: state.index,
      total: state.questions.length,
      timeLimit: timeLimit(state),
      removed: state.removed,
    };
  }

  async function withQuestion(state, lang, extra = {}) {
    return json({
      ...extra,
      score: state.score,
      token: seal({ lang, state }, getKey(), now()),
      question: await questionView(state, lang),
    });
  }

  // Jetonun kimliğini "kullanıldı" diye kaydeder; daha önce kullanılmışsa false.
  function claim(store, jti) {
    return store.claim(`jti:${jti}`, TOKEN_TTL_MS);
  }

  // Ref'lerden turun durumunu kurar: jetona sadece ref, tip, doğru cevap ve şık sayısı girer.
  async function roundOf(refs, lang, options) {
    const questions = await Promise.all(refs.map((ref) => catalog.resolve(ref, lang)));
    const slots = questions.map(({ ref, type, answer, size }) => ({ ref, type, answer, size }));
    return createRound(slots, now(), options);
  }

  async function startRound(request) {
    const body = await readJson(request);
    const input = body && pick(body, { area: isString, topic: isString, level: isString, lang: oneOf(...LANGS) });
    if (!input || !isValidSelection(input)) return fail(400, 'bad_request');

    const refs = await catalog.pick(input, newRandom(), ROUND_SIZE);
    if (refs.length === 0) return fail(404, 'no_questions');
    return withQuestion(await roundOf(refs, input.lang), input.lang);
  }

  // Tarih metninden üretilen tohum sayesinde aynı gün herkes aynı soruyu (aynı şık sırasıyla) görür.
  async function startDaily(request) {
    const body = await readJson(request);
    const input = body && pick(body, { lang: oneOf(...LANGS) });
    if (!input) return fail(400, 'bad_request');

    const date = dayKey(new Date(now()), DAILY_TIME_ZONE);
    const refs = await catalog.pick(DAILY_SELECTION, mulberry32(hashString(`daily:${date}`)), 1);
    if (refs.length === 0) return fail(404, 'no_questions');
    return withQuestion(await roundOf(refs, input.lang, { jokers: false }), input.lang, { date });
  }


  async function answerQuestion(request, store) {
    const body = await readJson(request);
    const input = body && pick(body, { token: isString, choice: isChoice });
    if (!input) return fail(400, 'bad_request');

    const opened = open(input.token, getKey(), now());
    if (!opened) return fail(400, 'invalid_token');
    const { state, lang } = opened.data;

    const next = answer(state, input.choice, now());
    if (next === state) return fail(400, 'bad_request');
    if (!(await claim(store, opened.jti))) return fail(409, 'already_used');

    const result = next.results.at(-1);
    const question = await catalog.resolve(result.ref, lang);
    const reveal = {
      id: question.id,
      correct: result.correct,
      timedOut: result.timedOut,
      points: result.points,
      answer: question.answer,
      explain: question.explain,
    };

    if (next.finished) {
      const correct = next.results.filter((item) => item.correct).length;
      return json({ result: reveal, score: next.score, summary: { score: next.score, correct, total: next.questions.length } });
    }
    return withQuestion(next, lang, { result: reveal });
  }

  async function playJoker(request, store) {
    const body = await readJson(request);
    const input = body && pick(body, { token: isString, kind: oneOf('fifty', 'time') });
    if (!input) return fail(400, 'bad_request');

    const opened = open(input.token, getKey(), now());
    if (!opened) return fail(400, 'invalid_token');
    const { state, lang } = opened.data;

    const next = useJoker(state, input.kind, now(), newRandom());
    if (next === state) return fail(400, 'bad_request');
    if (!(await claim(store, opened.jti))) return fail(409, 'already_used');

    return json({
      token: seal({ lang, state: next }, getKey(), now()),
      removed: next.removed,
      timeLimit: timeLimit(next),
    });
  }

  return {
    round: endpoint(startRound, { getStore }),
    daily: endpoint(startDaily, { getStore }),
    answer: endpoint(answerQuestion, { getStore }),
    joker: endpoint(playJoker, { getStore }),
  };
}