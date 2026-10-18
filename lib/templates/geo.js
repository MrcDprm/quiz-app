// Ortak "en büyüğü hangisi?" kalıbı: nehirlerde uzunluk, dağlarda yükseklik.
// Doğru şık diğerlerinden belirgin biçimde büyüktür; soru rakam ezberine dönmesin.
import { pick as pickOne, sample } from '../random.js';
import { both } from './shared.js';

export const formatNumber = (value, lang) => value.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US');

/**
 * measure: öğenin karşılaştırılan değeri; ratio: doğru şık en az bu kat büyük olmalı.
 * text: { q, unit } — soru metni ve açıklamadaki birim.
 */
export function largestTemplate({ dataset, topics, measure, ratio, text }) {
  return {
    dataset,
    topics,
    pick: ({ band }, random) => {
      if (band.length < 4) return null;
      const target = pickOne(random, band);
      const smaller = band.filter((other) => measure(other) * ratio <= measure(target));
      return smaller.length >= 3 ? [target.id, ...sample(random, smaller, 3).map((item) => item.id)] : null;
    },
    build: ({ byId }, ids) => {
      const items = ids.map((id) => byId.get(id));
      if (items.some((item) => !item)) return null;
      const [target, ...others] = items;
      if (others.some((other) => measure(other) * ratio > measure(target))) return null;
      const sorted = [...items].sort((a, b) => measure(b) - measure(a));
      return {
        type: 'choice',
        q: text.q,
        options: both((lang) => items.map((item) => item.name[lang])),
        explain: both((lang) => sorted.map((item) => `${item.name[lang]} ≈ ${formatNumber(measure(item), lang)} ${text.unit}`).join(', ')),
      };
    },
  };
}
