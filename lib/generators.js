// Veri setlerinden şablonla soru üreten motor.
// Soru kimliği bir tariftir: "gen:<şablon>:<zorluk>:<varlıklar>". Aynı kimlik ve tohum hep aynı soruyu verir.
// Her şablonun iki işi var: pick zorluğa uygun varlıkları seçer, build kimlikten soruyu kurar
// (doğru şık ilk sırada; karıştırma buildQuestion'da yapılır).
import { mulberry32, pick as pickOne } from './random.js';
import { buildQuestion } from './questions.js';
import { DIFFICULTIES } from '../public/src/topics.js';
import * as people from './templates/people.js';
import * as countries from './templates/countries.js';
import * as works from './templates/works.js';
import * as elements from './templates/elements.js';
import * as math from './templates/math.js';
import * as sport from './templates/sport.js';
import * as rivers from './templates/rivers.js';
import * as mountains from './templates/mountains.js';
import * as events from './templates/events.js';
import * as discoveries from './templates/discoveries.js';

const MODULES = [people, countries, works, elements, math, sport, rivers, mountains, events, discoveries];
const DATASETS = Object.fromEntries(MODULES.map((module) => [module.dataset.name, module.dataset]));
const TEMPLATES = Object.assign({}, ...MODULES.map((module) => module.templates));
// Bazı şablonlar (matematik) yalnızca belirli zorluklarda sorulur.
const fits = (template, difficulty) => !template.difficulties || template.difficulties.includes(difficulty);
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

  // Bayraklar ülke kodu → resim (data URL); bayrak sorusu şablonu kullanır.
  const flags = data.flags instanceof Map ? data.flags : new Map();
  const contextOf = (name, difficulty) => {
    const { config, all, byId } = sets[name];
    return { all, byId, flags, band: all.filter((item) => config.inBand(item, difficulty)) };
  };

  return {
    // Konuya ve zorluğa uyan şablonlardan en fazla count tane farklı soru kimliği üretir.
    // exclude: daha önce gösterilen kimlikler; bunlar yeniden üretilmez.
    pick(topic, difficulty, random, count, exclude = new Set()) {
      if (!DIFFICULTIES.includes(difficulty)) return [];
      const usable = Object.entries(TEMPLATES).filter(([, template]) => template.topics.includes(topic) && fits(template, difficulty));
      const ids = new Set();
      for (let attempt = 0; usable.length && ids.size < count && attempt < count * 10; attempt++) {
        const [name, template] = pickOne(random, usable);
        const context = contextOf(template.dataset, difficulty);
        const hasData = context.band.length > 0 || DATASETS[template.dataset].virtual;
        const entities = hasData ? template.pick(context, random, topic) : null;
        const id = entities && `gen:${name}:${difficulty}:${entities.join('.')}`;
        if (id && !exclude.has(id)) ids.add(id);
      }
      return [...ids];
    },

    // Kimlik ve tohumdan soruyu kurar; kimlik geçersizse ya da veri değiştiyse null.
    build(id, seed, lang) {
      const match = GEN_ID.exec(id);
      if (!match) return null;
      const [, name, difficulty, entities] = match;
      if (!Object.hasOwn(TEMPLATES, name) || !DIFFICULTIES.includes(difficulty)) return null;
      const template = TEMPLATES[name];
      if (!fits(template, difficulty)) return null;
      // Yanlış şıklar için ayrı bir tohum; şıkların sırası buildQuestion'da karışır.
      const raw = template.build(contextOf(template.dataset, difficulty), entities.split('.'), mulberry32(seed ^ 0x5bd1e995));
      return raw && buildQuestion({ ...raw, id }, seed, lang);
    },
  };
}