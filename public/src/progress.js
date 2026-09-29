// Oyuncunun ilerlemesi: istatistikler, yanlış cevaplanan sorular ve rozetler.
// Hepsi saf fonksiyon; tarayıcıda saklanır, sunucuya gitmez.

export const MAX_MISTAKES = 100;
export const MAX_SEEN = 50;
const MASTERS_TARGET = 8;

export const EMPTY_STATS = Object.freeze({
  rounds: 0,
  answered: 0,
  correct: 0,
  dailyCorrect: 0,
  perfect: 0,
  perfectNoJokers: 0,
  mastersHigh: 0,
  cleared: 0,
  topics: [],
  best: {},
});

/** Seçimin anahtarı: "general:geography:high". En iyi puan ve keşfedilen konular bununla tutulur. */
export const selectionKey = ({ area, topic, level }) => `${area}:${topic}:${level}`;

/**
 * Biten bir turu istatistiklere işler ve yeni bir nesne döndürür.
 * round: { mode, area, topic, level, results: [true, false, ...], score, usedJokers }
 */
export function recordRound(stats, round) {
  const correct = round.results.filter(Boolean).length;
  const next = {
    ...stats,
    answered: stats.answered + round.results.length,
    correct: stats.correct + correct,
  };
  if (round.mode === 'daily') {
    return { ...next, dailyCorrect: stats.dailyCorrect + (correct === 1 ? 1 : 0) };
  }

  const perfect = correct === round.results.length;
  next.rounds = stats.rounds + 1;
  next.perfect = stats.perfect + (perfect ? 1 : 0);
  next.perfectNoJokers = stats.perfectNoJokers + (perfect && !round.usedJokers ? 1 : 0);
  next.mastersHigh = stats.mastersHigh + (round.level === 'masters' && correct >= MASTERS_TARGET ? 1 : 0);
  if (round.mode === 'round') {
    const key = selectionKey(round);
    next.topics = stats.topics.includes(key) ? stats.topics : [...stats.topics, key];
    next.best = { ...stats.best, [key]: Math.max(stats.best[key] ?? 0, round.score) };
  }
  return next;
}

/**
 * Cevaplanan sorulara göre "Hatalarım" listesini günceller: yanlışlar sona eklenir,
 * doğru cevaplananlar çıkar. Liste en fazla 100 soru tutar (en eskiler düşer).
 * answers: [{ id, correct }]
 */
export function updateMistakes(mistakes, answers) {
  let next = [...mistakes];
  for (const { id, correct } of answers) {
    next = next.filter((item) => item !== id);
    if (!correct) next.push(id);
  }
  return next.slice(-MAX_MISTAKES);
}

/**
 * Bir seçimde gösterilen soruları hatırlar; sunucu bunları bir sonraki turda sormaz.
 * reset: sunucu soruların bittiğini ve eskileri tekrar kullandığını bildirdiyse liste yeniden başlar.
 */
export function rememberSeen(seen, key, ids, reset = false) {
  const previous = reset ? [] : (seen[key] ?? []);
  const next = [...previous.filter((id) => !ids.includes(id)), ...ids].slice(-MAX_SEEN);
  return { ...seen, [key]: next };
}

// Rozetler: her biri istatistiklere bakan bir koşul.
export const BADGES = [
  { id: 'firstRound', earned: (s) => s.rounds >= 1 },
  { id: 'perfect', earned: (s) => s.perfect >= 1 },
  { id: 'noJokers', earned: (s) => s.perfectNoJokers >= 1 },
  { id: 'streak3', earned: (s, streak) => streak.best >= 3 },
  { id: 'streak7', earned: (s, streak) => streak.best >= 7 },
  { id: 'streak30', earned: (s, streak) => streak.best >= 30 },
  { id: 'explorer', earned: (s) => new Set(s.topics.map((key) => key.split(':')[1]).filter((topic) => topic !== 'mixed')).size >= 5 },
  { id: 'masters', earned: (s) => s.mastersHigh >= 1 },
  { id: 'daily7', earned: (s) => s.dailyCorrect >= 7 },
  { id: 'cleaner', earned: (s) => s.cleared >= 1 },
  { id: 'hundred', earned: (s) => s.correct >= 100 },
];

export function earnedBadges(stats, streak) {
  return BADGES.filter((badge) => badge.earned(stats, streak)).map((badge) => badge.id);
}