// Dağ şablonları: "Hangisi en yüksek dağdır?" ve "Kilimanjaro hangi ülkededir?"
// Sınırda duran dağların (Everest, Mont Blanc…) ülkesi boştur; onlar sadece yükseklik sorusunda çıkar.
import { pick as pickOne, sample } from '../random.js';
import { inTier, isLocalizedName, isTier } from './shared.js';
import { formatNumber, largestTemplate } from './geo.js';

export const dataset = {
  name: 'mountains',
  isValid: (mountain) =>
    Boolean(mountain) &&
    /^[a-z0-9]+$/.test(mountain.id) &&
    isLocalizedName(mountain.name) &&
    Number.isInteger(mountain.m) &&
    mountain.m > 0 &&
    (mountain.country === null || isLocalizedName(mountain.country)) &&
    isTier(mountain.tier),
  inBand: inTier,
};

export const templates = {
  peak: largestTemplate({
    dataset: 'mountains',
    topics: ['geography'],
    measure: (mountain) => mountain.m,
    ratio: 1.15,
    text: { q: { tr: 'Hangisi en yüksek dağdır?', en: 'Which of these mountains is the highest?' }, unit: 'm' },
  }),

  peakcountry: {
    dataset: 'mountains',
    topics: ['geography'],
    pick: ({ band }, random) => {
      const candidates = band.filter((mountain) => mountain.country);
      return candidates.length ? [pickOne(random, candidates).id] : null;
    },
    build: ({ byId, all }, [id], random) => {
      const mountain = byId.get(id);
      if (!mountain?.country) return null;
      const countries = new Map();
      for (const other of all) {
        if (other.country && other.country.en !== mountain.country.en) countries.set(other.country.en, other.country);
      }
      if (countries.size < 3) return null;
      const options = [mountain.country, ...sample(random, [...countries.values()], 3)];
      return {
        type: 'choice',
        q: { tr: `${mountain.name.tr} hangi ülkededir?`, en: `Which country is ${mountain.name.en} in?` },
        options: { tr: options.map((item) => item.tr), en: options.map((item) => item.en) },
        explain: {
          tr: `${mountain.name.tr}: ${mountain.country.tr}, ${formatNumber(mountain.m, 'tr')} m.`,
          en: `${mountain.name.en}: ${mountain.country.en}, ${formatNumber(mountain.m, 'en')} m.`,
        },
      };
    },
  },
};
