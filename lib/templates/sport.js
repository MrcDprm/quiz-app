// Spor şablonları: Dünya Kupası şampiyonu ve ev sahibi, Yaz Olimpiyatları'nın ev sahibi şehri.
// Tanınırlık yıla göre verilir: yakın tarihli turnuvalar kolay, eskiler zor.
import { pick as pickOne, sample } from '../random.js';
import { TIER_BANDS, isLocalizedName } from './shared.js';

const isCup = (item) => item.kind === 'worldcup';

/** 1 = herkes hatırlar, 4 = spor tarihi meraklısı */
export function sportTier(item) {
  const steps = isCup(item) ? [1998, 1978, 1958] : [1996, 1968, 1936];
  const index = steps.findIndex((year) => item.year >= year);
  return index === -1 ? 4 : index + 1;
}

export const dataset = {
  name: 'sport',
  isValid: (item) =>
    Boolean(item) &&
    /^(WC|OG)\d{4}$/.test(item.id) &&
    Number.isInteger(item.year) &&
    (item.kind === 'worldcup'
      ? isLocalizedName(item.host) && isLocalizedName(item.winner) && /^[a-z]+$/.test(item.team)
      : item.kind === 'olympics' && isLocalizedName(item.city)),
  inBand: (item, difficulty) => {
    const tier = sportTier(item);
    return tier >= TIER_BANDS[difficulty][0] && tier <= TIER_BANDS[difficulty][1];
  },
};

/** Her anahtardan bir tane: aynı ülke ya da şehir şıklarda iki kez çıkmasın. */
function distinct(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const pickOf = (filter) => ({ band }, random) => {
  const candidates = band.filter(filter);
  return candidates.length ? [pickOne(random, candidates).id] : null;
};

// Ortak ev sahipliği (2002) "hangi ülke" sorusuna uymaz; sadece şampiyon sorusunda kullanılır.
const singleHost = (item) => isCup(item) && !item.host.en.includes(' and ');
// Batı Almanya ile Almanya aynı soruda iki ayrı şık olarak çıkmasın
const hostKey = (item) => item.host.en.replace(/^West /, '');

export const templates = {
  // "2010 FIFA Dünya Kupası'nı hangi ülke kazandı?" Yanlış şıklar başka şampiyonlar.
  cupwinner: {
    dataset: 'sport',
    topics: ['sport'],
    pick: pickOf(isCup),
    build: ({ byId, all }, [id], random) => {
      const cup = byId.get(id);
      if (!cup || !isCup(cup)) return null;
      const others = distinct(all.filter((item) => isCup(item) && item.team !== cup.team), (item) => item.team);
      if (others.length < 3) return null;
      const options = [cup, ...sample(random, others, 3)];
      return {
        type: 'choice',
        q: { tr: `${cup.year} FIFA Dünya Kupası'nı hangi ülke kazandı?`, en: `Which country won the ${cup.year} FIFA World Cup?` },
        options: { tr: options.map((item) => item.winner.tr), en: options.map((item) => item.winner.en) },
        explain: {
          tr: `${cup.year} Dünya Kupası'nın şampiyonu ${cup.winner.tr}. Ev sahibi: ${cup.host.tr}.`,
          en: `${cup.winner.en} won the ${cup.year} World Cup. Host: ${cup.host.en}.`,
        },
      };
    },
  },

  // "2014 FIFA Dünya Kupası hangi ülkede düzenlendi?"
  cuphost: {
    dataset: 'sport',
    topics: ['sport'],
    pick: pickOf(singleHost),
    build: ({ byId, all }, [id], random) => {
      const cup = byId.get(id);
      if (!cup || !singleHost(cup)) return null;
      const others = distinct(all.filter((item) => singleHost(item) && hostKey(item) !== hostKey(cup)), hostKey);
      const options = [cup, ...sample(random, others, 3)];
      return {
        type: 'choice',
        q: { tr: `${cup.year} FIFA Dünya Kupası hangi ülkede düzenlendi?`, en: `Which country hosted the ${cup.year} FIFA World Cup?` },
        options: { tr: options.map((item) => item.host.tr), en: options.map((item) => item.host.en) },
        explain: {
          tr: `${cup.year} Dünya Kupası ${cup.host.tr} ev sahipliğinde oynandı; şampiyon ${cup.winner.tr} oldu.`,
          en: `The ${cup.year} World Cup was hosted by ${cup.host.en} and won by ${cup.winner.en}.`,
        },
      };
    },
  },

  // "2008 Yaz Olimpiyat Oyunları hangi şehirde düzenlendi?"
  olympics: {
    dataset: 'sport',
    topics: ['sport'],
    pick: pickOf((item) => item.kind === 'olympics'),
    build: ({ byId, all }, [id], random) => {
      const games = byId.get(id);
      if (!games || games.kind !== 'olympics') return null;
      const others = distinct(all.filter((item) => item.kind === 'olympics' && item.city.en !== games.city.en), (item) => item.city.en);
      const options = [games, ...sample(random, others, 3)];
      return {
        type: 'choice',
        q: {
          tr: `${games.year} Yaz Olimpiyat Oyunları hangi şehirde düzenlendi?`,
          en: `Which city hosted the ${games.year} Summer Olympics?`,
        },
        options: { tr: options.map((item) => item.city.tr), en: options.map((item) => item.city.en) },
        explain: {
          tr: `${games.year} Yaz Olimpiyatları'nın ev sahibi şehri: ${games.city.tr}.${games.year === 2020 ? ' Salgın nedeniyle oyunlar 2021’de yapıldı.' : ''}`,
          en: `The ${games.year} Summer Olympics were held in ${games.city.en}.${games.year === 2020 ? ' Because of the pandemic, they took place in 2021.' : ''}`,
        },
      };
    },
  },
};
