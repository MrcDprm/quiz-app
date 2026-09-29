// Matematik şablonları: ilkokul, ortaokul ve lise için her seferinde yeni sayılarla üretilen sorular.
// Kimlik sayıları taşır ("gen:add:primary:47.38"); aynı kimlik hep aynı soruyu verir.
import { randomInt, pick as pickOne, shuffle } from '../random.js';

// Sayılar kimliğe yazıldığı için kimlik biçimine uyan pozitif tam sayılar kullanılır.
const isCount = (value) => /^\d{1,6}$/.test(value);

export const dataset = {
  name: 'math',
  // Matematik şablonları dosyadan veri okumaz; motor boş bir listeyle çalışır.
  isValid: () => false,
  inBand: () => true,
  virtual: true,
};

const numbers = (ids) => (ids.every(isCount) ? ids.map(Number) : null);

/** Doğru cevabın çevresinden, hepsi farklı ve pozitif 3 yanlış şık. */
function nearby(answer, random, spread) {
  const wrong = new Set();
  const steps = shuffle(random, [-3, -2, -1, 1, 2, 3].map((step) => step * spread));
  for (const step of steps) {
    const value = answer + step;
    if (value > 0 && value !== answer) wrong.add(value);
    if (wrong.size === 3) break;
  }
  for (let value = answer + 4 * spread; wrong.size < 3; value += spread) wrong.add(value);
  return [...wrong];
}

const choice = (q, answer, wrong, explain) => ({
  type: 'choice',
  q,
  options: { tr: [answer, ...wrong].map(String), en: [answer, ...wrong].map(String) },
  explain,
});

const format = (value, lang) => value.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US');

// Her şablon: hangi seviyede sorulduğu, sayıları seçen pick ve soruyu kuran build.
export const templates = {
  // İlkokul: iki basamaklı toplama. "47 + 38 kaçtır?"
  add: {
    dataset: 'math',
    topics: ['math'],
    levels: ['primary'],
    pick: (_, random) => [randomInt(random, 12, 89), randomInt(random, 11, 89)],
    build: (_, ids) => {
      const [a, b] = numbers(ids) ?? [];
      if (a === undefined) return null;
      const answer = a + b;
      return choice(
        { tr: `${a} + ${b} kaçtır?`, en: `What is ${a} + ${b}?` },
        answer,
        [answer + 10, answer - 10, answer + 1],
        { tr: `${a} + ${b} = ${answer}`, en: `${a} + ${b} = ${answer}` },
      );
    },
  },

  // İlkokul: çarpım tablosu. "7 × 8 kaçtır?"
  times: {
    dataset: 'math',
    topics: ['math'],
    levels: ['primary'],
    pick: (_, random) => [randomInt(random, 3, 9), randomInt(random, 3, 9)],
    build: (_, ids) => {
      const [a, b] = numbers(ids) ?? [];
      if (a === undefined) return null;
      const answer = a * b;
      const wrong = [...new Set([answer + a, answer - b, (a + 1) * (b - 1), answer + 1, answer - 2])]
        .filter((value) => value > 0 && value !== answer)
        .slice(0, 3);
      return choice({ tr: `${a} × ${b} kaçtır?`, en: `What is ${a} × ${b}?` }, answer, wrong, {
        tr: `${a} × ${b} = ${answer}`,
        en: `${a} × ${b} = ${answer}`,
      });
    },
  },

  // Ortaokul: yüzde. "240’ın %25’i kaçtır?"
  percent: {
    dataset: 'math',
    topics: ['math'],
    levels: ['middle'],
    pick: (_, random) => [pickOne(random, [10, 20, 25, 50, 75]), randomInt(random, 2, 16) * 20],
    build: (_, ids, random) => {
      const [rate, base] = numbers(ids) ?? [];
      if (rate === undefined || (rate * base) % 100 !== 0) return null;
      const answer = (rate * base) / 100;
      return choice(
        { tr: `${base} sayısının %${rate}’i kaçtır?`, en: `What is ${rate}% of ${base}?` },
        answer,
        nearby(answer, random, Math.max(1, Math.round(answer / 5))),
        {
          tr: `${base} × ${rate} / 100 = ${answer}`,
          en: `${base} × ${rate} / 100 = ${answer}`,
        },
      );
    },
  },

  // Ortaokul: üslü sayı. "2⁵ kaçtır?"
  power: {
    dataset: 'math',
    topics: ['math'],
    levels: ['middle'],
    pick: (_, random) => {
      const base = randomInt(random, 2, 5);
      return [base, randomInt(random, 2, base === 2 ? 8 : 4)];
    },
    build: (_, ids) => {
      const [base, exponent] = numbers(ids) ?? [];
      if (base === undefined) return null;
      const answer = base ** exponent;
      const superscript = String(exponent).replace(/\d/g, (digit) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[digit]);
      const wrong = [...new Set([base * exponent, base ** (exponent - 1), answer + base, answer * 2])]
        .filter((value) => value !== answer && value > 0)
        .slice(0, 3);
      return choice({ tr: `${base}${superscript} kaçtır?`, en: `What is ${base}${superscript}?` }, answer, wrong, {
        tr: `${base} sayısı ${exponent} kez kendisiyle çarpılır: ${answer}.`,
        en: `${base} multiplied by itself ${exponent} times is ${answer}.`,
      });
    },
  },

  // Lise: birinci dereceden denklem. "3x + 7 = 22 ise x kaçtır?"
  equation: {
    dataset: 'math',
    topics: ['math'],
    levels: ['high'],
    pick: (_, random) => [randomInt(random, 2, 9), randomInt(random, 2, 12), randomInt(random, 1, 30)],
    build: (_, ids, random) => {
      const [a, x, b] = numbers(ids) ?? [];
      if (a === undefined) return null;
      const c = a * x + b;
      return choice(
        { tr: `${a}x + ${b} = ${c} ise x kaçtır?`, en: `If ${a}x + ${b} = ${c}, what is x?` },
        x,
        nearby(x, random, 1),
        { tr: `${a}x = ${c} − ${b} = ${a * x}, x = ${x}`, en: `${a}x = ${c} − ${b} = ${a * x}, x = ${x}` },
      );
    },
  },

  // Lise: dik üçgende hipotenüs (Pisagor üçlüleri). "Dik kenarları 6 ve 8 olan üçgenin hipotenüsü?"
  hypotenuse: {
    dataset: 'math',
    topics: ['math'],
    levels: ['high'],
    pick: (_, random) => {
      const [a, b] = pickOne(random, [[3, 4], [5, 12], [8, 15], [7, 24]]);
      const k = randomInt(random, 1, 3);
      return [a * k, b * k];
    },
    build: (_, ids, random) => {
      const [a, b] = numbers(ids) ?? [];
      if (a === undefined) return null;
      const answer = Math.sqrt(a * a + b * b);
      if (!Number.isInteger(answer)) return null;
      return choice(
        {
          tr: `Dik kenarları ${a} ve ${b} olan dik üçgenin hipotenüsü kaçtır?`,
          en: `A right triangle has legs ${a} and ${b}. How long is the hypotenuse?`,
        },
        answer,
        [...new Set([a + b, ...nearby(answer, random, 1)])].filter((value) => value !== answer).slice(0, 3),
        {
          tr: `Pisagor: ${a}² + ${b}² = ${format(a * a + b * b, 'tr')} = ${answer}²`,
          en: `Pythagoras: ${a}² + ${b}² = ${format(a * a + b * b, 'en')} = ${answer}²`,
        },
      );
    },
  },
};