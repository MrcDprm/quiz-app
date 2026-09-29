// Ülke şablonları: başkent, kıta ve en kalabalık ülke.
import { pick as pickOne, sample } from '../random.js';
import { both, genitiveTr, inTier, isLocalizedName, isTier } from './shared.js';

export const CONTINENTS = {
  europe: { tr: 'Avrupa', en: 'Europe' },
  asia: { tr: 'Asya', en: 'Asia' },
  africa: { tr: 'Afrika', en: 'Africa' },
  northAmerica: { tr: 'Kuzey Amerika', en: 'North America' },
  southAmerica: { tr: 'Güney Amerika', en: 'South America' },
  oceania: { tr: 'Okyanusya', en: 'Oceania' },
};

// İngilizcede "the" ile anılan ülkeler: "the United Kingdom", "the Netherlands".
const WITH_THE = new Set(['GB', 'US', 'NL', 'PH', 'AE', 'CD', 'DO']);
const nameEn = (country) => (WITH_THE.has(country.id) ? `the ${country.name.en}` : country.name.en);
const startEn = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// En kalabalık ülke sorusunda diğer ülkeler en az bu kadar kat küçük olmalı; soru rakam ezberi olmaz.
const POPULATION_RATIO = 3;

export const dataset = {
  name: 'countries',
  isValid: (country) =>
    Boolean(country) &&
    /^[A-Z]{2}$/.test(country.id) &&
    isLocalizedName(country.name) &&
    (country.capital === null || isLocalizedName(country.capital)) &&
    (country.continent === null || Object.hasOwn(CONTINENTS, country.continent)) &&
    typeof country.population === 'number' &&
    country.population > 0 &&
    isTier(country.tier),
  inBand: inTier,
};

function formatPopulation(millions, lang) {
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US';
  if (millions >= 1000) {
    const billions = (millions / 1000).toLocaleString(locale, { maximumFractionDigits: 1 });
    return lang === 'tr' ? `${billions} milyar` : `${billions} billion`;
  }
  if (millions >= 1) {
    const rounded = Math.round(millions).toLocaleString(locale);
    return lang === 'tr' ? `${rounded} milyon` : `${rounded} million`;
  }
  const thousands = Math.round(millions * 1000).toLocaleString(locale);
  return lang === 'tr' ? `${thousands} bin` : `${thousands} thousand`;
}

export const templates = {
  // "Japonya'nın başkenti neresidir?" Yanlış şıklar mümkünse aynı kıtadan.
  capital: {
    dataset: 'countries',
    topics: ['general', 'geography'],
    pick: ({ band }, random) => {
      const candidates = band.filter((country) => country.capital);
      return candidates.length ? [pickOne(random, candidates).id] : null;
    },
    build: ({ byId, all }, [id], random) => {
      const country = byId.get(id);
      if (!country?.capital) return null;
      const others = all.filter((other) => other.capital && other.id !== id && other.capital.en !== country.capital.en);
      const neighbours = others.filter((other) => other.continent && other.continent === country.continent);
      const wrong = sample(random, neighbours.length >= 3 ? neighbours : others, 3);
      return {
        type: 'choice',
        q: {
          tr: `${genitiveTr(country.name.tr)} başkenti neresidir?`,
          en: `What is the capital of ${nameEn(country)}?`,
        },
        options: both((lang) => [country, ...wrong].map((item) => item.capital[lang])),
        explain: {
          tr: `${genitiveTr(country.name.tr)} başkenti ${country.capital.tr}.`,
          en: `The capital of ${nameEn(country)} is ${country.capital.en}.`,
        },
      };
    },
  },

  // "Brezilya hangi kıtadadır?" İki kıtaya yayılan ülkeler sorulmaz.
  continent: {
    dataset: 'countries',
    topics: ['geography'],
    pick: ({ band }, random) => {
      const candidates = band.filter((country) => country.continent);
      return candidates.length ? [pickOne(random, candidates).id] : null;
    },
    build: ({ byId }, [id], random) => {
      const country = byId.get(id);
      if (!country?.continent) return null;
      const wrong = sample(random, Object.keys(CONTINENTS).filter((key) => key !== country.continent), 3);
      const label = CONTINENTS[country.continent];
      return {
        type: 'choice',
        q: { tr: `${country.name.tr} hangi kıtadadır?`, en: `Which continent is ${nameEn(country)} in?` },
        options: both((lang) => [country.continent, ...wrong].map((key) => CONTINENTS[key][lang])),
        explain: {
          tr: `${country.name.tr}, ${label.tr} kıtasındadır.`,
          en: `${startEn(nameEn(country))} is in ${label.en}.`,
        },
      };
    },
  },

  // "Hangi ülkenin nüfusu en fazladır?" Fark her zaman büyüktür.
  population: {
    dataset: 'countries',
    topics: ['geography'],
    pick: ({ band }, random) => {
      const target = pickOne(random, band);
      const smaller = band.filter((other) => other.population * POPULATION_RATIO <= target.population);
      return smaller.length >= 3 ? [target.id, ...sample(random, smaller, 3).map((item) => item.id)] : null;
    },
    build: ({ byId }, ids) => {
      const countries = ids.map((id) => byId.get(id));
      if (countries.some((country) => !country)) return null;
      const [target, ...others] = countries;
      if (others.some((other) => other.population * POPULATION_RATIO > target.population)) return null;
      const sorted = [...countries].sort((a, b) => b.population - a.population);
      return {
        type: 'choice',
        q: { tr: 'Hangi ülkenin nüfusu en fazladır?', en: 'Which country has the largest population?' },
        options: both((lang) => countries.map((country) => country.name[lang])),
        explain: both((lang) =>
          sorted.map((country) => `${country.name[lang]} ≈ ${formatPopulation(country.population, lang)}`).join(', '),
        ),
      };
    },
  },
};