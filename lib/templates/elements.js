// Element şablonları: sembolden ada ve addan sembole.
import { pick as pickOne, sample } from '../random.js';
import { inTier, isLocalizedName, isTier } from './shared.js';

export const dataset = {
  name: 'elements',
  isValid: (element) =>
    Boolean(element) &&
    /^[A-Z][a-z]?$/.test(element.id) &&
    isLocalizedName(element.name) &&
    Number.isInteger(element.number) &&
    isTier(element.tier),
  inBand: inTier,
};

const explainOf = (element) => ({
  tr: `${element.name.tr} elementinin sembolü ${element.id}, atom numarası ${element.number}.`,
  en: `The symbol for ${element.name.en.toLowerCase()} is ${element.id}; its atomic number is ${element.number}.`,
});

// Yanlış şıklar mümkünse aynı harfle başlayan sembollerden seçilir (Au, Ag, Al, Ar...).
function lookAlikes(all, element, random) {
  const others = all.filter((other) => other.id !== element.id);
  const similar = others.filter((other) => other.id[0] === element.id[0]);
  const rest = others.filter((other) => other.id[0] !== element.id[0]);
  return [...sample(random, similar, 2), ...sample(random, rest, 3)].slice(0, 3);
}

const pickElement = ({ band }, random) => (band.length ? [pickOne(random, band).id] : null);

export const templates = {
  // "“Fe” hangi elementin sembolüdür?"
  symbol: {
    dataset: 'elements',
    topics: ['science'],
    pick: pickElement,
    build: ({ byId, all }, [id], random) => {
      const element = byId.get(id);
      if (!element) return null;
      const options = [element, ...lookAlikes(all, element, random)];
      return {
        type: 'choice',
        q: { tr: `“${element.id}” hangi elementin sembolüdür?`, en: `Which element has the symbol “${element.id}”?` },
        options: { tr: options.map((item) => item.name.tr), en: options.map((item) => item.name.en) },
        explain: explainOf(element),
      };
    },
  },

  // "Altın elementinin sembolü nedir?"
  element: {
    dataset: 'elements',
    topics: ['science'],
    pick: pickElement,
    build: ({ byId, all }, [id], random) => {
      const element = byId.get(id);
      if (!element) return null;
      const symbols = [element, ...lookAlikes(all, element, random)].map((item) => item.id);
      return {
        type: 'choice',
        q: {
          tr: `${element.name.tr} elementinin sembolü nedir?`,
          en: `What is the chemical symbol for ${element.name.en.toLowerCase()}?`,
        },
        options: { tr: symbols, en: symbols },
        explain: explainOf(element),
      };
    },
  },
};