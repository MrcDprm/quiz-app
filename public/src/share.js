// Sonucu paylaşılacak kısa bir metne çevirir (Wordle tarzı).
import { translate } from './i18n.js';

export const SITE = 'quiz.miracdeprem.com';

const grid = (results) => results.map((correct) => (correct ? '🟩' : '🟥')).join('');

/** "30.09.2026" / "Sep 30, 2026": gün anahtarı dile göre biçimlenir. */
export function formatDay(key, lang) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function dailyShareText({ lang, date, correct, streak }) {
  const t = (key, params) => translate(lang, key, params);
  const fire = streak > 0 ? ` 🔥${streak}` : '';
  return `${t('title')} · ${t('dailyTitle')} · ${formatDay(date, lang)}\n${correct ? '✅' : '❌'}${fire}\n${SITE}`;
}

export function roundShareText({ lang, topic, level, results, score }) {
  const t = (key, params) => translate(lang, key, params);
  const correct = results.filter(Boolean).length;
  return [
    `${t('title')} · ${t(`topic_${topic}`)} · ${t(`level_${level}`)}`,
    `${grid(results)} ${correct}/${results.length} · ${t('resultScore', { score })}`,
    SITE,
  ].join('\n');
}