// Eser şablonları: "Bu eser kimin?" ve "Hangisi bu sanatçının eseri?"
import { pick as pickOne, sample } from '../random.js';
import { both, inTier, isLocalizedName, isTier } from './shared.js';

// Her tür için soru kalıpları. Türkçe ekler özel adlara değil türün adına eklenir ("filmini").
const KINDS = {
  painting: {
    family: 'art',
    ask: { tr: (t) => `“${t}” tablosunu kim yapmıştır?`, en: (t) => `Who painted “${t}”?` },
    done: { tr: 'yapılmıştır', en: 'painted' },
  },
  sculpture: {
    family: 'art',
    ask: { tr: (t) => `“${t}” heykelini kim yapmıştır?`, en: (t) => `Who sculpted “${t}”?` },
    done: { tr: 'yapılmıştır', en: 'sculpted' },
  },
  book: {
    family: 'book',
    ask: { tr: (t) => `“${t}” kitabını kim yazmıştır?`, en: (t) => `Who wrote “${t}”?` },
    done: { tr: 'yazılmıştır', en: 'written' },
  },
  film: {
    family: 'film',
    ask: { tr: (t) => `“${t}” filmini kim yönetmiştir?`, en: (t) => `Who directed “${t}”?` },
    done: { tr: 'yönetilmiştir', en: 'directed' },
  },
  music: {
    family: 'music',
    ask: { tr: (t) => `“${t}” eserini kim bestelemiştir?`, en: (t) => `Who composed “${t}”?` },
    done: { tr: 'bestelenmiştir', en: 'composed' },
  },
  song: {
    family: 'music',
    ask: { tr: (t) => `“${t}” şarkısı kime aittir?`, en: (t) => `Who performed “${t}”?` },
    done: { tr: 'seslendirilmiştir', en: 'performed' },
  },
  album: {
    family: 'music',
    ask: { tr: (t) => `“${t}” albümü kime aittir?`, en: (t) => `Whose album is “${t}”?` },
    done: { tr: 'yayımlanmıştır', en: 'released' },
  },
};

// Edebiyat konusunda filmler sorulmaz; genel kültürde hepsi sorulur.
const TOPIC_FAMILIES = { literature: ['art', 'book', 'music'], general: ['art', 'book', 'film', 'music'] };

export const dataset = {
  name: 'works',
  isValid: (work) =>
    Boolean(work) &&
    /^W\d{3}$/.test(work.id) &&
    Object.hasOwn(KINDS, work.kind) &&
    isLocalizedName(work.title) &&
    isLocalizedName(work.creator) &&
    isTier(work.tier),
  inBand: inTier,
};

const familyOf = (work) => KINDS[work.kind].family;
const sameFamily = (a, b) => familyOf(a) === familyOf(b);
const inTopic = (topic) => (work) => (TOPIC_FAMILIES[topic] ?? []).includes(familyOf(work));

// Aynı aileden, farklı yaratıcıya ait eserler; yaratıcı başına bir eser.
function otherCreators(all, work) {
  const byCreator = new Map();
  for (const other of all) {
    if (sameFamily(other, work) && other.creator.en !== work.creator.en && !byCreator.has(other.creator.en)) {
      byCreator.set(other.creator.en, other);
    }
  }
  return [...byCreator.values()];
}

function explainOf(work) {
  const done = KINDS[work.kind].done;
  return {
    tr: `“${work.title.tr}”, ${work.creator.tr} tarafından ${done.tr}.`,
    en: `“${work.title.en}” was ${done.en} by ${work.creator.en}.`,
  };
}

export const templates = {
  // "“Suç ve Ceza” kitabını kim yazmıştır?"
  creator: {
    dataset: 'works',
    topics: ['general', 'literature'],
    pick: ({ band }, random, topic) => {
      const candidates = band.filter(inTopic(topic));
      return candidates.length ? [pickOne(random, candidates).id] : null;
    },
    build: ({ byId, all }, [id], random) => {
      const work = byId.get(id);
      if (!work) return null;
      const others = otherCreators(all, work);
      if (others.length < 3) return null;
      const wrong = sample(random, others, 3);
      return {
        type: 'choice',
        q: both((lang) => KINDS[work.kind].ask[lang](work.title[lang])),
        options: both((lang) => [work, ...wrong].map((item) => item.creator[lang])),
        explain: explainOf(work),
      };
    },
  },

  // "Hangisi Victor Hugo tarafından yazılmıştır?"
  by: {
    dataset: 'works',
    topics: ['general', 'literature'],
    pick: ({ band }, random, topic) => {
      const candidates = band.filter(inTopic(topic));
      return candidates.length ? [pickOne(random, candidates).id] : null;
    },
    build: ({ byId, all }, [id], random) => {
      const work = byId.get(id);
      if (!work) return null;
      const others = otherCreators(all, work);
      if (others.length < 3) return null;
      const wrong = sample(random, others, 3);
      const done = KINDS[work.kind].done;
      return {
        type: 'choice',
        q: {
          tr: `Hangisi ${work.creator.tr} tarafından ${done.tr}?`,
          en: `Which of these was ${done.en} by ${work.creator.en}?`,
        },
        options: both((lang) => [work, ...wrong].map((item) => item.title[lang])),
        explain: explainOf(work),
      };
    },
  },
};