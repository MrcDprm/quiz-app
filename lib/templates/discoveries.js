// Buluş ve keşif şablonu: "Penisilini kim keşfetti?"
// Veri sadece tek bir kişiye (ya da tanınmış bir ikiliye) tartışmasız mal edilen buluşları içerir.
import { pick as pickOne, sample } from '../random.js';
import { inTier, isLocalizedName, isTier } from './shared.js';

export const dataset = {
  name: 'discoveries',
  isValid: (item) =>
    Boolean(item) &&
    /^D\d{2}$/.test(item.id) &&
    isLocalizedName(item.q, 160) &&
    isLocalizedName(item.by) &&
    Number.isInteger(item.year) &&
    isTier(item.tier),
  inBand: inTier,
};

const when = (item, lang) => (item.approx ? (lang === 'tr' ? `yaklaşık ${item.year}` : `around ${item.year}`) : String(item.year));

export const templates = {
  discovery: {
    dataset: 'discoveries',
    topics: ['science', 'general'],
    pick: ({ band }, random) => (band.length ? [pickOne(random, band).id] : null),
    build: ({ byId, all }, [id], random) => {
      const item = byId.get(id);
      if (!item) return null;
      // Aynı kişi iki şıkta çıkmasın (Pasteur iki buluşla listede)
      const people = new Map();
      for (const other of all) if (other.by.en !== item.by.en) people.set(other.by.en, other.by);
      if (people.size < 3) return null;
      const options = [item.by, ...sample(random, [...people.values()], 3)];
      return {
        type: 'choice',
        q: item.q,
        options: { tr: options.map((by) => by.tr), en: options.map((by) => by.en) },
        explain: { tr: `${item.by.tr}, ${when(item, 'tr')}.`, en: `${item.by.en}, ${when(item, 'en')}.` },
      };
    },
  },
};
