// Şablonların ortak yardımcıları.

export const both = (make) => ({ tr: make('tr'), en: make('en') });

export const capitalize = (text, lang) => text.charAt(0).toLocaleUpperCase(lang) + text.slice(1);

export const isName = (value, max = 80) => typeof value === 'string' && value.trim() !== '' && value.length <= max;

export const isLocalizedName = (value, max = 80) => Boolean(value) && isName(value.tr, max) && isName(value.en, max);

// Tanınırlık katmanı (1 = herkes bilir, 4 = uzmanlık ister) → zorlukta kullanılan aralık.
// Bantlar bilerek üst üste biner: komşu zorluklar arasında sert bir sıçrama olmasın.
export const TIER_BANDS = {
  easy: [1, 2],
  medium: [2, 3],
  hard: [3, 4],
};

export const isTier = (value) => [1, 2, 3, 4].includes(value);

export const inTier = (item, difficulty) => item.tier >= TIER_BANDS[difficulty][0] && item.tier <= TIER_BANDS[difficulty][1];

// Türkçe tamlayan eki: "Japonya" → "Japonya'nın", "Mısır" → "Mısır'ın".
// Ek, son ünlüye göre seçilir; kuralın dışında kalan birkaç ad elle yazılır.
const GENITIVE_EXCEPTIONS = { Nepal: "Nepal'in", Senegal: "Senegal'in" };
const SUFFIX_VOWEL = { a: 'ı', ı: 'ı', e: 'i', i: 'i', o: 'u', u: 'u', ö: 'ü', ü: 'ü' };

export function genitiveTr(name) {
  if (Object.hasOwn(GENITIVE_EXCEPTIONS, name)) return GENITIVE_EXCEPTIONS[name];
  const lower = name.toLocaleLowerCase('tr');
  const lastVowel = [...lower].reverse().find((letter) => Object.hasOwn(SUFFIX_VOWEL, letter)) ?? 'e';
  const buffer = Object.hasOwn(SUFFIX_VOWEL, lower.at(-1)) ? 'n' : '';
  return `${name}'${buffer}${SUFFIX_VOWEL[lastVowel]}n`;
}