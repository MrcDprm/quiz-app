// Modelin yazdığı soruyu biçim olarak denetler ve havuz kaydına çevirir.
// Modelin çıktısına güvenilmez: alanlar tek tek kontrol edilir, uymayan soru atılır.
import { createHash } from 'node:crypto';

const MAX_QUESTION = 220;
const MAX_OPTION = 90;
const MAX_EXPLAIN = 320;
const BANNED = /all of the above|none of the above|both of the above|hepsi|hiçbiri|yukarıdaki|tümü/i;
const UNSAFE = /[<>\n\r`]|https?:\/\//;
// Uzun bir Türkçe metinde bu harflerin hiçbiri yoksa metin büyük ihtimalle Türkçe karaktersiz yazılmıştır ("yilinda")
const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
const ASCII_TURKISH_MIN = 40;

export const AI_ID = /^ai:([a-z-]+):(easy|medium|hard):([0-9a-f]{10})$/;

/** Karşılaştırma için sade metin: küçük harf, harf ve rakam dışı karakterler atılmış. */
export function normalizeText(text) {
  return text.toLocaleLowerCase('en').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const text = (value, min, max) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length >= min && trimmed.length <= max && !UNSAFE.test(trimmed) ? trimmed : null;
};

function optionsOf(correct, wrong) {
  if (!Array.isArray(wrong) || wrong.length !== 3) return null;
  const options = [text(correct, 1, MAX_OPTION), ...wrong.map((item) => text(item, 1, MAX_OPTION))];
  if (options.some((item) => !item || BANNED.test(item))) return null;
  return new Set(options.map(normalizeText)).size === 4 ? options : null;
}

/** Doğru cevap (en az 4 harfse) soru metninde geçiyorsa soru cevabı ele verir. */
const leaks = (question, answer) => {
  const needle = normalizeText(answer);
  return needle.length >= 4 && normalizeText(question).includes(needle);
};

/**
 * raw: modelin bir sorusu. Geçerliyse havuz kaydı ({ id, type, q, options, explain, … }; doğru şık ilk sırada),
 * değilse null.
 */
export function toPoolItem(raw, { topic, difficulty, now, model }) {
  if (!raw || typeof raw !== 'object') return null;
  const q = { tr: text(raw.question_tr, 10, MAX_QUESTION), en: text(raw.question_en, 10, MAX_QUESTION) };
  const explain = { tr: text(raw.explanation_tr, 10, MAX_EXPLAIN), en: text(raw.explanation_en, 10, MAX_EXPLAIN) };
  const options = { tr: optionsOf(raw.correct_tr, raw.wrong_tr), en: optionsOf(raw.correct_en, raw.wrong_en) };
  if (!q.tr || !q.en || !explain.tr || !explain.en || !options.tr || !options.en) return null;
  if (leaks(q.tr, options.tr[0]) || leaks(q.en, options.en[0])) return null;
  const turkish = `${q.tr} ${explain.tr}`;
  if (turkish.length >= ASCII_TURKISH_MIN && !TURKISH_LETTERS.test(turkish)) return null;
  if (BANNED.test(q.en) || / not |\bdeğildir\b/i.test(` ${q.en} ${q.tr} `)) return null;
  const hash = createHash('sha256').update(normalizeText(q.en)).digest('hex').slice(0, 10);
  return { id: `ai:${topic}:${difficulty}:${hash}`, type: 'choice', q, options, explain, model, createdAt: now };
}
