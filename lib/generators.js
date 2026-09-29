// Veri setlerinden şablonla soru üreten motor.
// Soru kimliği bir tariftir: "gen:<şablon>:<seviye>:<varlıklar>". Aynı kimlik ve tohum hep aynı soruyu verir.
// Her şablonun iki işi var: pick seviyeye uygun varlıkları seçer, build kimlikten soruyu kurar
// (doğru şık ilk sırada; karıştırma buildQuestion'da yapılır).
import { mulberry32, pick as pickOne } from './random.js';
import { buildQuestion } from './questions.js';
import { LEVELS } from '../public/src/topics.js';
import * as people from './templates/people.js';
import * as countries from './templates/countries.js';
import * as works from './templates/works.js';
import * as elements from './templates/elements.js';
import * as math from './templates/math.js';

const MODULES = [people, countries, works, elements, math];
const DATASETS = Object.fromEntries(MODULES.map((module) => [module.dataset.name, module.dataset]));
const TEMPLATES = Object.assign({}, ...MODULES.map((module) => module.templates));
// Bazı şablonlar (matematik) yalnızca belirli seviyelerde sorulur.
const fitsLevel = (template, level) => !template.levels || template.levels.includes(level);
const GEN_ID = /^gen:([a-z]+):([a-z]+):([A-Za-z0-9]+(?:\.[A-Za-z0-9]+){0,3})$/;

// data: { people: [...], countries: [...], ... }. Eksik veri seti boş sayılır.
export function createGenerators(data) {
  const sets = {};
  for (const [name, config] of Object.entries(DATASETS)) {
    const items = Array.isArray(data[name]) ? data[name] : [];
    const all = items.filter(config.isValid);
    if (all.length < items.length) console.warn(`Skipped ${items.length - all.length} invalid ${name}`);
    sets[name] = { config, all, byId: new Map(all.map((item) => [item.id, item])) };
  }

  const contextOf = (name, level) => {
    const { config, all, byId } = sets[name];
    return { all, byId, band: all.filter((item) => config.inBand(item, level)) };
  };

  return {
    // Konuya ve seviyeye uyan şablonlardan en fazla count tane farklı soru kimliği üretir.
    // exclude: daha önce gösterilen kimlikler; bunlar yeniden üretilmez.
    pick(topic, level, random, count, exclude = new Set()) {
      if (!LEVELS.includes(level)) return [];
      const usable = Object.entries(TEMPLATES).filter(([, template]) => template.topics.includes(topic) && fitsLevel(template, level));
      const ids = new Set();
      for (let attempt = 0; usable.length && ids.size < count && attempt < count * 10; attempt++) {
        const [name, template] = pickOne(random, usable);
        const context = contextOf(template.dataset, level);
        const hasData = context.band.length > 0 || DATASETS[template.dataset].virtual;
        const entities = hasData ? template.pick(context, random, topic) : null;
        const id = entities && `gen:${name}:${level}:${entities.join('.')}`;
        if (id && !exclude.has(id)) ids.add(id);
      }
      return [...ids];
    },

    // Kimlik ve tohumdan soruyu kurar; kimlik geçersizse ya da veri değiştiyse null.
    build(id, seed, lang) {
      const match = GEN_ID.exec(id);
      if (!match) return null;
      const [, name, level, entities] = match;
      if (!Object.hasOwn(TEMPLATES, name) || !LEVELS.includes(level)) return null;
      const template = TEMPLATES[name];
      if (!fitsLevel(template, level)) return null;      
      // Yanlış şıklar için ayrı bir tohum; şıkların sırası buildQuestion'da karışır.
      const raw = template.build(contextOf(template.dataset, level), entities.split('.'), mulberry32(seed ^ 0x5bd1e995));
      return raw && buildQuestion({ ...raw, id }, seed, lang);
    },
  };
}