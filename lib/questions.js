// Soru bankasındaki kayıtları doğrular ve oynanacak soruya çevirir.
// Dosyada doğru şık hep ilk sıradadır (sıralama sorusunda öğeler doğru sıradadır);
// karıştırma burada, sorunun tohumuyla yapılır.
import { mulberry32, shuffle } from './random.js';
import { LANGS, LEVELS } from '../public/src/topics.js';

export const BANK_TYPES = ['choice', 'code', 'order'];
const OPTION_COUNT = 4;
const MAX_TEXT = 300;
const MAX_CODE = 600;
const ID_PATTERN = /^[a-z-]+:[a-z]+:\d{3}$/;
const SEED_PATTERN = /^\d{1,10}$/;

const isText = (value, max = MAX_TEXT) =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max;

const isLocalized = (value) => Boolean(value) && LANGS.every((lang) => isText(value[lang]));

const isFourDistinct = (list) =>
  Array.isArray(list) &&
  list.length === OPTION_COUNT &&
  list.every((item) => isText(item)) &&
  new Set(list).size === OPTION_COUNT;

const isLocalizedList = (value) => Boolean(value) && LANGS.every((lang) => isFourDistinct(value[lang]));

export function isValidQuestion(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) return false;
  if (!LEVELS.includes(raw.level) || !BANK_TYPES.includes(raw.type)) return false;
  if (!isLocalized(raw.q) || !isLocalized(raw.explain)) return false;
  if (raw.type === 'order') return isLocalizedList(raw.items);
  if (raw.type === 'code' && !isText(raw.code, MAX_CODE)) return false;
  return isLocalizedList(raw.options);
}

// ref = "kimlik~tohum". Aynı ref her zaman aynı karıştırmayı verir.
export function makeRef(id, seed) {
  return `${id}~${seed}`;
}

export function parseRef(ref) {
  if (typeof ref !== 'string') return null;
  const [id, seedText, extra] = ref.split('~');
  if (!id || extra !== undefined || !SEED_PATTERN.test(seedText ?? '')) return null;
  const seed = Number(seedText);
  return seed <= 0xffffffff ? { id, seed } : null;
}

const isIdentity = (order) => order.every((value, i) => value === i);

export function buildQuestion(raw, seed, lang) {
  const order = shuffle(mulberry32(seed), [0, 1, 2, 3]);
  const base = {
    id: raw.id,
    ref: makeRef(raw.id, seed),
    type: raw.type,
    size: OPTION_COUNT,
    prompt: raw.q[lang],
    explain: raw.explain[lang],
  };

  if (raw.type === 'order') {
    // Öğeler zaten doğru sırada gösterilirse soru bedava olur; o durumda kaydırılır.
    const shown = isIdentity(order) ? [1, 2, 3, 0] : order;
    return {
      ...base,
      items: shown.map((i) => raw.items[lang][i]),
      answer: [0, 1, 2, 3].map((position) => shown.indexOf(position)),
    };
  }

  return {
    ...base,
    ...(raw.code && { code: raw.code }),
    options: order.map((i) => raw.options[lang][i]),
    answer: order.indexOf(0),
  };
}

// Cevaptan önce tarayıcıya giden hâl: cevap, açıklama ve tohum (ref) yok.
export function toPublic(question) {
  const { answer, explain, ref, id, ...view } = question;
  return view;
}