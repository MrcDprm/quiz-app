// Nehir şablonu (Wikidata): "Hangisi en uzun nehirdir?"
import { inTier, isLocalizedName, isTier } from './shared.js';
import { largestTemplate } from './geo.js';

export const dataset = {
  name: 'rivers',
  isValid: (river) =>
    Boolean(river) &&
    /^Q\d+$/.test(river.id) &&
    isLocalizedName(river.name) &&
    Number.isInteger(river.km) &&
    river.km > 0 &&
    isTier(river.tier),
  inBand: inTier,
};

export const templates = {
  // Uzunluk kaynağa göre değişebilir; en uzun nehir diğerlerinden en az %30 uzun seçilir.
  river: largestTemplate({
    dataset: 'rivers',
    topics: ['geography'],
    measure: (river) => river.km,
    ratio: 1.3,
    text: { q: { tr: 'Hangisi en uzun nehirdir?', en: 'Which of these rivers is the longest?' }, unit: 'km' },
  }),
};
