// Kişi şablonları (Wikidata): "Kimdir?", "Hangisi bir ressam?" ve dönem sıralaması.
// Tarih ya da sayı ezberi sorulmaz; doğum yılı sadece sıralamada ve açıklamada kullanılır.
import { sample, shuffle, pick as pickOne } from '../random.js';
import { both, capitalize, isLocalizedName } from './shared.js';

export const GROUP_LABELS = {
  scientist: { tr: 'bilim insanı', en: 'scientist' },
  writer: { tr: 'yazar', en: 'writer' },
  painter: { tr: 'ressam ya da heykeltıraş', en: 'painter or sculptor' },
  composer: { tr: 'besteci', en: 'composer' },
  singer: { tr: 'şarkıcı', en: 'singer' },
  actor: { tr: 'oyuncu', en: 'actor' },
  director: { tr: 'film yönetmeni', en: 'film director' },
  footballer: { tr: 'futbolcu', en: 'footballer' },
  basketball: { tr: 'basketbolcu', en: 'basketball player' },
  tennis: { tr: 'tenisçi', en: 'tennis player' },
  philosopher: { tr: 'filozof', en: 'philosopher' },
  politician: { tr: 'siyasetçi', en: 'politician' },
  explorer: { tr: 'kâşif', en: 'explorer' },
  astronaut: { tr: 'astronot', en: 'astronaut' },
  royalty: { tr: 'hükümdar', en: 'monarch' },
};
const GROUPS = Object.keys(GROUP_LABELS);

// Tanınırlık (kaç dilde Wikipedia sayfası olduğu) aralıkları; bantlar bilerek üst üste biner.
export const FAME_BANDS = {
  primary: [200, Infinity],
  middle: [150, 260],
  high: [110, 200],
  university: [80, 160],
  masters: [60, 130],
};
const ERA_GAP = 100;
const PERSON_ID = /^Q\d+$/;

const withArticle = (label) => (/^[aeiou]/.test(label) ? `an ${label}` : `a ${label}`);
const yearText = (year, lang) => {
  if (year > 0) return String(year);
  return lang === 'tr' ? `MÖ ${-year}` : `${-year} BC`;
};

export const dataset = {
  name: 'people',
  isValid: (person) =>
    Boolean(person) &&
    PERSON_ID.test(person.id) &&
    isLocalizedName(person.name) &&
    Number.isInteger(person.born) &&
    Array.isArray(person.groups) &&
    person.groups.length > 0 &&
    person.groups.every((group) => Object.hasOwn(GROUP_LABELS, group)) &&
    Number.isInteger(person.fame),
  inBand: (person, level) => person.fame >= FAME_BANDS[level][0] && person.fame <= FAME_BANDS[level][1],
};

export const templates = {
  // "Nelson Mandela en çok hangi alanda tanınır?"
  who: {
    dataset: 'people',
    topics: ['general'],
    pick: ({ band }, random) => {
      const candidates = band.filter((person) => person.groups.length === 1);
      return candidates.length ? [pickOne(random, candidates).id] : null;
    },
    build: ({ byId }, [id], random) => {
      const person = byId.get(id);
      if (!person || person.groups.length !== 1) return null;
      const [group] = person.groups;
      const wrong = sample(random, GROUPS.filter((other) => !person.groups.includes(other)), 3);
      return {
        type: 'choice',
        q: {
          tr: `${person.name.tr} en çok hangi alanda tanınır?`,
          en: `What is ${person.name.en} best known as?`,
        },
        options: both((lang) => [group, ...wrong].map((key) => capitalize(GROUP_LABELS[key][lang], lang))),
        explain: {
          tr: `${person.name.tr} bir ${GROUP_LABELS[group].tr} olarak tanınır.`,
          en: `${person.name.en} is known as ${withArticle(GROUP_LABELS[group].en)}.`,
        },
      };
    },
  },

  // "Hangisi bir ressam?"
  which: {
    dataset: 'people',
    topics: ['general'],
    pick: ({ band }, random) => {
      const candidates = band.filter((person) => person.groups.length === 1);
      return candidates.length ? [pickOne(random, candidates).id] : null;
    },
    build: ({ byId, band }, [id], random) => {
      const person = byId.get(id);
      if (!person || person.groups.length !== 1) return null;
      const [group] = person.groups;
      const others = band.filter((other) => !other.groups.includes(group));
      if (others.length < 3) return null;
      const people = [person, ...sample(random, others, 3)];
      const label = GROUP_LABELS[group];
      return {
        type: 'choice',
        q: { tr: `Hangisi bir ${label.tr}?`, en: `Which of these people is ${withArticle(label.en)}?` },
        options: both((lang) => people.map((item) => item.name[lang])),
        explain: {
          tr: `${person.name.tr} bir ${label.tr} olarak tanınır.`,
          en: `${person.name.en} is known as ${withArticle(label.en)}.`,
        },
      };
    },
  },

  // "Bu kişileri yaşadıkları döneme göre sırala." Aralarında en az 100 yıl vardır.
  era: {
    dataset: 'people',
    topics: ['general', 'history'],
    pick: ({ band }, random) => {
      const chosen = [];
      for (const person of shuffle(random, band)) {
        if (chosen.every((other) => Math.abs(other.born - person.born) >= ERA_GAP)) chosen.push(person);
        if (chosen.length === 4) return chosen.map((item) => item.id);
      }
      return null;
    },
    build: ({ byId }, ids) => {
      const people = ids.map((id) => byId.get(id));
      if (people.some((person) => !person)) return null;
      people.sort((a, b) => a.born - b.born);
      if (people.some((person, i) => i > 0 && person.born - people[i - 1].born < ERA_GAP)) return null;
      return {
        type: 'order',
        q: {
          tr: 'Bu kişileri yaşadıkları döneme göre eskiden yeniye sırala.',
          en: 'Order these people from earliest to latest by when they lived.',
        },
        items: both((lang) => people.map((person) => person.name[lang])),
        explain: both((lang) => people.map((person) => `${person.name[lang]} (${yearText(person.born, lang)})`).join(', ')),
      };
    },
  },
};
