// Tarihî olay şablonları: kronolojik sıralama ve "hangi yüzyılda?".
import { pick as pickOne, shuffle } from '../random.js';
import { both, inTier, isLocalizedName, isTier } from './shared.js';

// Sıralama sorusunda olaylar arasında en az bu kadar yıl olur; yakın tarihler tahmine kalmasın.
const ORDER_GAP = 30;

export const dataset = {
  name: 'events',
  isValid: (event) =>
    Boolean(event) &&
    /^E\d{2}$/.test(event.id) &&
    isLocalizedName(event.name, 100) &&
    Number.isInteger(event.year) &&
    event.year !== 0 &&
    isTier(event.tier),
  inBand: inTier,
};

const yearText = (year, lang) => (year > 0 ? String(year) : lang === 'tr' ? `MÖ ${-year}` : `${-year} BC`);

export const centuryOf = (year) => Math.floor((year - 1) / 100) + 1;

/** "15. yüzyıl" / "15th century" */
export function centuryText(century, lang) {
  if (lang === 'tr') return `${century}. yüzyıl`;
  const tens = century % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[century % 10] ?? 'th';
  return `${century}${suffix} century`;
}

export const templates = {
  // "Bu olayları eskiden yeniye sırala."
  events: {
    dataset: 'events',
    topics: ['history', 'general'],
    pick: ({ band }, random) => {
      const chosen = [];
      for (const event of shuffle(random, band)) {
        if (chosen.every((other) => Math.abs(other.year - event.year) >= ORDER_GAP)) chosen.push(event);
        if (chosen.length === 4) return chosen.map((item) => item.id);
      }
      return null;
    },
    build: ({ byId }, ids) => {
      const events = ids.map((id) => byId.get(id));
      if (events.some((event) => !event)) return null;
      events.sort((a, b) => a.year - b.year);
      if (events.some((event, i) => i > 0 && event.year - events[i - 1].year < ORDER_GAP)) return null;
      return {
        type: 'order',
        q: { tr: 'Bu olayları eskiden yeniye sırala.', en: 'Order these events from earliest to latest.' },
        items: both((lang) => events.map((event) => event.name[lang])),
        explain: both((lang) => events.map((event) => `${event.name[lang]} (${yearText(event.year, lang)})`).join(', ')),
      };
    },
  },

  // "İstanbul'un Fethi hangi yüzyılda oldu?" Yanlış şıklar komşu yüzyıllar.
  century: {
    dataset: 'events',
    topics: ['history'],
    pick: ({ band }, random) => {
      const candidates = band.filter((event) => event.year > 0);
      return candidates.length ? [pickOne(random, candidates).id] : null;
    },
    build: ({ byId }, [id], random) => {
      const event = byId.get(id);
      if (!event || event.year <= 0) return null;
      const century = centuryOf(event.year);
      // En yakın komşu yüzyıllardan üç tane (1 ile 21 arasında kalanlar)
      const nearby = [-1, 1, -2, 2, -3, 3].map((step) => century + step).filter((value) => value >= 1 && value <= 21);
      const wrong = shuffle(random, nearby.slice(0, 4)).slice(0, 3);
      const options = [century, ...wrong];
      return {
        type: 'choice',
        q: { tr: `${event.name.tr} hangi yüzyılda oldu?`, en: `In which century did this happen: ${event.name.en}?` },
        options: both((lang) => options.map((value) => centuryText(value, lang))),
        explain: {
          tr: `${event.name.tr}: ${event.year}, yani ${centuryText(century, 'tr')}.`,
          en: `${event.name.en}: ${event.year}, the ${centuryText(century, 'en')}.`,
        },
      };
    },
  },
};
