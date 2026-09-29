// Arayüz: tur ayarı, soru ekranı, süre çubuğu ve sonuç. Kurallar ve cevaplar sunucuda (bkz. lib/).
import { AREAS, LEVELS } from './topics.js';
import { DAILY_TIME_ZONE, dayKey } from './dates.js';
import { currentStreak, recordDay } from './streak.js';
import { dailyShareText, formatDay, roundShareText, shareLinks } from './share.js';
import { BADGES, earnedBadges, recordRound, rememberSeen, selectionKey, updateMistakes } from './progress.js';
import { loadSettings, saveSettings, topicsOf } from './storage.js';
import { translate } from './i18n.js';
import { applyTheme, nextTheme } from './theme.js';
import { post } from './api-client.js';

const browserLang = navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
const settings = loadSettings(undefined, browserLang);
const t = (key, params) => translate(settings.lang, key, params);
const dailyToday = () => dayKey(new Date(), DAILY_TIME_ZONE); // günün sorusu İstanbul saatiyle değişir
const localToday = () => dayKey(new Date()); // seri, kullanıcının kendi günüyle sayılır

const $ = (id) => document.getElementById(id);
const el = {
  screens: { setup: $('setup-screen'), round: $('round-screen'), result: $('result-screen') },
  setupForm: $('setup-form'),
  areaGroup: $('area-group'),
  topic: $('topic'),
  level: $('level'),
  start: $('start'),
  setupStatus: $('setup-status'),
  dailyDate: $('daily-date'),
  dailyText: $('daily-text'),
  dailyStart: $('daily-start'),
  dailyShare: $('daily-share'),
  dailyShareStatus: $('daily-share-status'),
  streak: $('streak'),
  bestStreak: $('best-streak'),
  bestScore: $('best-score'),
  statRounds: $('stat-rounds'),
  statCorrect: $('stat-correct'),
  statAccuracy: $('stat-accuracy'),
  reviewStart: $('review-start'),
  reviewStatus: $('review-status'),
  badges: $('badges'),
  roundCount: $('round-count'),
  roundScore: $('round-score'),
  timer: $('timer'),
  timerAnnounce: $('timer-announce'),
  prompt: $('prompt'),
  code: $('code'),
  codeText: $('code-text'),
  options: $('options'),
  order: $('order'),
  feedback: $('feedback'),
  jokerFifty: $('joker-fifty'),
  jokerTime: $('joker-time'),
  confirmOrder: $('confirm-order'),
  next: $('next'),
  resultTitle: $('result-title'),
  resultScore: $('result-score'),
  resultCorrect: $('result-correct'),
  resultGrid: $('result-grid'),
  review: $('review'),
  playAgain: $('play-again'),
  shareResult: $('share-result'),
  resultShareStatus: $('result-share-status'),
  newBadges: $('new-badges'),
  shareDialog: $('share-dialog'),
  shareText: $('share-text'),
  shareTargets: $('share-targets'),
  shareStatus: $('share-status'),
  shareNative: $('share-native'),
  shareCopy: $('share-copy'),
  shareClose: $('share-close'),
  changeTopic: $('change-topic'),
  themeToggle: $('theme-toggle'),
  langButtons: document.querySelectorAll('[data-lang]'),
};

// Açık turun istemcideki kopyası. Doğru cevap burada hiçbir zaman cevaptan önce bulunmaz.
let round = null;
let lastShare = null; // sonuç ekranındaki "Paylaş" düğmesinin metnini üreten fonksiyon
let timerId = null;

/** Metinli bir öğe oluşturur; kullanıcıya giden her metin textContent ile yazılır (XSS yok). */
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function showScreen(name) {
  for (const [key, screen] of Object.entries(el.screens)) screen.hidden = key !== name;
  window.scrollTo(0, 0);
}

function setBusy(button, busy) {
  button.setAttribute('aria-disabled', String(busy));
}

const isBusy = (button) => button.getAttribute('aria-disabled') === 'true';

// ---------- Ana sayfa: günün sorusu ve seri ----------

function renderHome() {
  const today = dailyToday();
  const solved = settings.daily?.date === today;
  el.dailyDate.textContent = formatDay(today, settings.lang);
  el.dailyText.textContent = solved
    ? `${t(settings.daily.correct ? 'dailyCorrect' : 'dailyWrong')} ${t('dailyNext')}`
    : t('dailyIntro');
  el.dailyStart.hidden = solved;
  el.dailyShare.hidden = !solved;
  el.dailyShareStatus.textContent = '';

  const streak = currentStreak(settings.streak, localToday());
  el.streak.textContent = streak > 0 ? t('streak', { count: streak }) : t('streakNone');
  el.bestStreak.textContent = settings.streak.best > 0 ? `· ${t('bestStreak', { best: settings.streak.best })}` : '';
  renderProgress();
}

function renderProgress() {
  const { stats, mistakes } = settings;
  const locale = settings.lang === 'tr' ? 'tr-TR' : 'en-US';
  el.statRounds.textContent = stats.rounds;
  el.statCorrect.textContent = stats.correct;
  el.statAccuracy.textContent = stats.answered
    ? (stats.correct / stats.answered).toLocaleString(locale, { style: 'percent' })
    : '–';

  el.reviewStart.textContent = mistakes.length ? t('reviewStart', { count: mistakes.length }) : t('reviewEmpty');
  setBusy(el.reviewStart, mistakes.length === 0);
  el.reviewStatus.textContent = '';

  const earned = earnedBadges(stats, settings.streak);
  el.badges.replaceChildren(
    ...BADGES.map(({ id }) => {
      const badge = node('li', earned.includes(id) ? 'badge earned' : 'badge', t(`badge_${id}`));
      badge.title = t(`badgeInfo_${id}`);
      badge.append(node('span', 'sr-only', ` (${t(`badgeInfo_${id}`)})`));
      return badge;
    }),
  );
  renderBestScore();
}

function renderBestScore() {
  const best = settings.stats.best[selectionKey(settings)];
  el.bestScore.textContent = best ? t('bestScore', { score: best }) : '';
}

function goHome() {
  renderHome();
  showScreen('setup');
}

// Paylaşım penceresi: metin görünür ve düzenlenmeden kopyalanabilir, altında platform bağlantıları var.
function openShare(text) {
  el.shareText.value = text;
  el.shareStatus.textContent = '';
  el.shareTargets.replaceChildren(
    ...shareLinks(text).map(({ id, label, href, copyFirst }) => {
      const link = node('a', 'share-target', label);
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.dataset.id = id;
      if (copyFirst) link.dataset.copyFirst = '';
      return link;
    }),
  );
  el.shareNative.hidden = !navigator.share; // telefonda sistemin paylaşım menüsü (Instagram dahil)
  el.shareDialog.showModal();
  el.shareText.select();
}

async function copyText(message) {
  try {
    await navigator.clipboard.writeText(el.shareText.value);
    el.shareStatus.textContent = message;
  } catch {
    el.shareText.select(); // kopyalanamazsa metin seçili kalır, kullanıcı elle kopyalar
    el.shareStatus.textContent = t('copyFailed');
  }
}

async function shareNative() {
  try {
    await navigator.share({ text: el.shareText.value });
  } catch {
    // Kullanıcı sistem menüsünü kapattı; pencere açık kalır
  }
}

function shareDaily() {
  const { date, correct } = settings.daily;
  const streak = currentStreak(settings.streak, localToday());
  openShare(dailyShareText({ lang: settings.lang, date, correct, streak }));
}

// ---------- Tur ayarı ----------

function renderSetup() {
  el.areaGroup.replaceChildren(
    ...Object.keys(AREAS).map((area) => {
      const button = node('button', 'segment', t(`area_${area}`));
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(area === settings.area));
      button.dataset.area = area;
      return button;
    }),
  );
  const options = (values, prefix, selected) =>
    values.map((value) => {
      const option = node('option', null, t(`${prefix}_${value}`));
      option.value = value;
      option.selected = value === selected;
      return option;
    });
  el.level.replaceChildren(...options(LEVELS, 'level', settings.level));
  el.topic.replaceChildren(...options(topicsOf(settings.area, settings.level), 'topic', settings.topic));
  renderBestScore();
}

// Alan ya da seviye değişince seçili konu artık sunulmuyorsa listenin ilk konusuna geçilir.
function updateSelection(changes) {
  Object.assign(settings, changes);
  const topics = topicsOf(settings.area, settings.level);
  if (!topics.includes(settings.topic)) settings.topic = topics[0];
  saveSettings(settings);
  renderSetup();
}

// Normal tur ve günün sorusu aynı yoldan başlar; farkları mode alanında tutulur.
async function begin(button, status, path, body, extra) {
  if (isBusy(button)) return;
  setBusy(button, true);
  status.textContent = t('loading');
  const { data, error } = await post(path, body);
  setBusy(button, false);
  if (error) {
    goHome(); // "Yeni tur" sonuç ekranından basıldıysa mesaj ana sayfada görünsün
    status.textContent = t(`error_${error}`);
    return;
  }
  status.textContent = '';
  round = { token: data.token, question: data.question, score: data.score, history: [], answered: false, busy: false, ...extra(data) };
  showScreen('round');
  renderQuestion();
}

// Bu seçimde daha önce görülen sorular gönderilir; sunucu önce hiç sorulmamışları seçer.
function startRound() {
  const { area, topic, level, lang } = settings;
  const seen = settings.seen[selectionKey(settings)] ?? [];
  begin(el.start, el.setupStatus, '/api/round', { area, topic, level, lang, seen }, (data) => ({
    mode: 'round',
    area,
    topic,
    level,
    recycled: data.recycled === true,
  }));
}

// Günün sorusunda joker yok: iki joker de kullanılmış sayılır ve gizlenir.
function startDaily() {
  begin(el.dailyStart, el.dailyShareStatus, '/api/daily', { lang: settings.lang }, (data) => ({
    mode: 'daily',
    date: data.date,
    usedFifty: true,
    usedTime: true,
  }));
}

// En eski 10 hata sorulur; doğru cevaplananlar listeden düşer.
function startReview() {
  if (settings.mistakes.length === 0) return;
  const ids = settings.mistakes.slice(0, 10);
  begin(el.reviewStart, el.reviewStatus, '/api/review', { ids, lang: settings.lang }, () => ({ mode: 'review' }));
}


// ---------- Soru ----------

function renderQuestion() {
  const { question } = round;
  el.roundCount.textContent = t('questionOf', { index: question.index + 1, total: question.total });
  el.roundScore.textContent = round.score;
  el.prompt.textContent = question.prompt;
  el.code.hidden = question.type !== 'code';
  el.codeText.textContent = question.code ?? '';
  el.feedback.replaceChildren();
  el.next.hidden = true;

  const isOrder = question.type === 'order';
  el.options.hidden = isOrder;
  el.order.hidden = !isOrder;
  el.confirmOrder.hidden = !isOrder;
  if (isOrder) {
    round.order = question.items.map((_, i) => i);
    renderOrder();
    el.feedback.textContent = t('orderHint');
  } else {
    el.options.replaceChildren(
      ...question.options.map((text, i) => {
        const button = node('button', 'option');
        button.type = 'button';
        button.dataset.index = i;
        button.append(node('span', 'option-key', String(i + 1)), node('span', 'option-text', text));
        return button;
      }),
    );
    markRemoved(question.removed);
  }
  updateJokers();
  el.prompt.focus();
  startTimer(question.timeLimit);
}

function renderOrder() {
  const { items } = round.question;
  el.order.replaceChildren(
    ...round.order.map((itemIndex, position) => {
      const item = node('li', 'order-item');
      const text = items[itemIndex];
      item.append(node('span', 'order-text', text));
      if (round.answered) return item; // cevaptan sonra taşıma düğmeleri gösterilmez
      const up = node('button', 'order-move', '↑');
      const down = node('button', 'order-move', '↓');
      for (const [button, step, label] of [[up, -1, 'moveUp'], [down, 1, 'moveDown']]) {
        button.type = 'button';
        button.dataset.position = position;
        button.dataset.step = step;
        button.setAttribute('aria-label', t(label, { item: text }));
      }
      setBusy(up, position === 0);
      setBusy(down, position === round.order.length - 1);
      item.append(up, down);
      return item;
    }),
  );
}

function moveItem(position, step) {
  const target = position + step;
  if (round.answered || target < 0 || target >= round.order.length) return;
  [round.order[position], round.order[target]] = [round.order[target], round.order[position]];
  renderOrder();
  el.order.querySelector(`[data-position="${target}"][data-step="${step}"]`)?.focus();
}

function markRemoved(removed) {
  for (const button of el.options.children) {
    if (removed.includes(Number(button.dataset.index))) {
      button.classList.add('removed');
      setBusy(button, true);
    }
  }
}

function updateJokers() {
  el.jokerFifty.hidden = Boolean(round.usedFifty);
  el.jokerTime.hidden = Boolean(round.usedTime);
  setBusy(el.jokerFifty, round.answered || round.question.type === 'order');
  setBusy(el.jokerTime, round.answered);
}

// ---------- Süre ----------

// Süreyi asıl ölçen sunucu; buradaki çubuk sadece gösterim. Süre bitince boş cevap gönderilir.
function startTimer(limit) {
  stopTimer();
  round.shownAt = performance.now();
  round.limit = limit;
  round.announced = false;
  tick();
  timerId = setInterval(tick, 200);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function tick() {
  const remaining = Math.max(0, round.limit - (performance.now() - round.shownAt));
  el.timer.style.setProperty('--left', String(remaining / round.limit));
  el.timer.classList.toggle('low', remaining <= 5000);
  if (remaining <= 5000 && !round.announced) {
    round.announced = true;
    el.timerAnnounce.textContent = t('secondsLeft', { seconds: 5 });
  }
  if (remaining === 0) submit(null);
}

// ---------- Cevap ve jokerler ----------

async function submit(choice) {
  if (!round || round.answered || round.busy) return;
  round.busy = true;
  stopTimer();
  const { data, error } = await post('/api/answer', { token: round.token, choice });
  round.busy = false;
  if (error) return showRoundError(error);

  round.answered = true;
  round.score = data.score;
  round.next = data;
  round.history.push({ question: round.question, choice, result: data.result });
  renderReveal(choice, data.result);
}

function renderReveal(choice, result) {
  const { question } = round;
  el.roundScore.textContent = round.score;
  if (question.type === 'order') {
    round.order = result.answer;
    renderOrder();
    for (const item of el.order.children) item.classList.add(result.correct ? 'correct' : 'shown');
    el.confirmOrder.hidden = true;
  } else {
    for (const button of el.options.children) {
      const index = Number(button.dataset.index);
      setBusy(button, true);
      if (index === result.answer) button.classList.add('correct');
      else if (index === choice) button.classList.add('wrong');
    }
  }

  const verdict = result.timedOut ? t('timeout') : result.correct ? t('correct', { points: result.points }) : t('wrong');
  el.feedback.replaceChildren(
    node('strong', result.correct ? 'verdict good' : 'verdict bad', verdict),
    node('span', 'explain', result.explain),
  );
  updateJokers();
  el.next.textContent = round.next.summary ? t('finish') : t('next');
  el.next.hidden = false;
  el.next.focus();
}

function goNext() {
  if (!round?.answered) return;
  const { next } = round;
  if (next.summary) return showResult(next.summary);
  round.token = next.token;
  round.question = next.question;
  round.answered = false;
  renderQuestion();
}

async function useJoker(kind) {
  const button = kind === 'fifty' ? el.jokerFifty : el.jokerTime;
  if (!round || round.answered || round.busy || isBusy(button)) return;
  round.busy = true;
  const { data, error } = await post('/api/joker', { token: round.token, kind });
  round.busy = false;
  if (error) return showRoundError(error);

  round.token = data.token;
  if (kind === 'fifty') {
    round.usedFifty = true;
    markRemoved(data.removed);
  } else {
    round.usedTime = true;
    round.limit = data.timeLimit;
  }
  updateJokers();
}

function showRoundError(error) {
  stopTimer();
  round.answered = true;
  el.feedback.replaceChildren(node('strong', 'verdict bad', t(`error_${error}`)));
  el.next.hidden = true;
  el.confirmOrder.hidden = true;
  updateJokers();
  const back = node('button', 'btn btn-secondary', t('changeTopic'));
  back.type = 'button';
  back.addEventListener('click', goHome);
  el.feedback.append(back);
  back.focus();
}

// ---------- Sonuç ----------

function answerText(question, answer) {
  if (answer === null) return t('noAnswer');
  if (question.type === 'order') return answer.map((i) => question.items[i]).join(' → ');
  return question.options[answer];
}

// Biten turu kaydeder (seri, günün sorusu, hatalar, istatistik) ve yeni kazanılan rozetleri döndürür.
function recordResult(summary, results) {
  const { mode, area, topic, level, date } = round;
  const badgesBefore = earnedBadges(settings.stats, settings.streak);
  const hadMistakes = settings.mistakes.length > 0;

  settings.streak = recordDay(settings.streak, localToday());
  if (mode === 'daily') settings.daily = { date, correct: results[0] };
  settings.mistakes = updateMistakes(
    settings.mistakes,
    round.history.map(({ result }) => ({ id: result.id, correct: result.correct })),
  );
  if (mode === 'round') {
    const ids = round.history.map(({ result }) => result.id);
    settings.seen = rememberSeen(settings.seen, selectionKey({ area, topic, level }), ids, round.recycled);
  }
  const usedJokers = Boolean(round.usedFifty || round.usedTime);
  settings.stats = recordRound(settings.stats, { mode, area, topic, level, results, score: summary.score, usedJokers });
  if (mode === 'review' && hadMistakes && settings.mistakes.length === 0) {
    settings.stats = { ...settings.stats, cleared: settings.stats.cleared + 1 };
  }
  saveSettings(settings);
  return earnedBadges(settings.stats, settings.streak).filter((id) => !badgesBefore.includes(id));
}

function showResult(summary) {
  stopTimer();
  const { mode, topic, level, date } = round;
  const results = round.history.map((entry) => entry.result.correct);
  const newBadges = recordResult(summary, results);

  if (mode === 'daily') {
    lastShare = () => dailyShareText({ lang: settings.lang, date, correct: results[0], streak: settings.streak.count });
  } else {
    lastShare = () => roundShareText({ lang: settings.lang, topic, level, results, score: summary.score });
  }
  const titles = { daily: `${t('dailyTitle')} · ${formatDay(date ?? dailyToday(), settings.lang)}`, review: t('reviewTitle') };
  el.resultTitle.textContent = titles[mode] ?? t('resultTitle');
  el.changeTopic.dataset.i18n = mode === 'round' ? 'changeTopic' : 'backHome';
  el.changeTopic.textContent = t(el.changeTopic.dataset.i18n);
  el.playAgain.hidden = mode !== 'round';
  el.shareResult.hidden = mode === 'review';
  el.newBadges.textContent = newBadges.length
    ? t('newBadges', { names: newBadges.map((id) => t(`badge_${id}`)).join(', ') })
    : '';
  el.resultShareStatus.textContent = '';
  el.resultScore.textContent = t('resultScore', { score: summary.score });
  el.resultCorrect.textContent = t('resultCorrect', { correct: summary.correct, total: summary.total });
  el.resultGrid.textContent = round.history.map((entry) => (entry.result.correct ? '🟩' : '🟥')).join('');
  el.review.replaceChildren(
    ...round.history.map(({ question, choice, result }) => {
      const item = node('li', result.correct ? 'review-item good' : 'review-item bad');
      item.append(node('p', 'review-prompt', question.prompt));
      if (question.code) item.append(node('pre', 'code small', question.code));
      if (!result.correct) item.append(node('p', 'review-line', `${t('yourAnswer')}: ${answerText(question, choice)}`));
      item.append(
        node('p', 'review-line', `${t('correctAnswer')}: ${answerText(question, result.answer)}`),
        node('p', 'review-explain', result.explain),
      );
      return item;
    }),
  );
  round = null;
  showScreen('result');
  (el.playAgain.hidden ? el.changeTopic : el.playAgain).focus();
}

// ---------- Dil ve tema ----------

function renderLanguage() {
  document.documentElement.lang = settings.lang;
  document.title = t('pageTitle');
  for (const item of document.querySelectorAll('[data-i18n]')) item.textContent = t(item.dataset.i18n);
  for (const item of document.querySelectorAll('[data-i18n-aria]')) item.setAttribute('aria-label', t(item.dataset.i18nAria));
  for (const button of el.langButtons) button.setAttribute('aria-pressed', String(button.dataset.lang === settings.lang));
  renderSetup();
  renderHome();
  el.setupStatus.textContent = '';
}

// ---------- Olaylar ----------

el.areaGroup.addEventListener('click', (event) => {
  const button = event.target.closest('[data-area]');
  if (button) updateSelection({ area: button.dataset.area });
});
el.topic.addEventListener('change', () => {
  settings.topic = el.topic.value;
  saveSettings(settings);
  renderBestScore();
});
el.level.addEventListener('change', () => updateSelection({ level: el.level.value }));
el.setupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  startRound();
});

el.options.addEventListener('click', (event) => {
  const button = event.target.closest('.option');
  if (button && !isBusy(button)) submit(Number(button.dataset.index));
});
el.order.addEventListener('click', (event) => {
  const button = event.target.closest('.order-move');
  if (button && !isBusy(button)) moveItem(Number(button.dataset.position), Number(button.dataset.step));
});
el.confirmOrder.addEventListener('click', () => submit([...round.order]));
el.next.addEventListener('click', goNext);
el.jokerFifty.addEventListener('click', () => useJoker('fifty'));
el.jokerTime.addEventListener('click', () => useJoker('time'));
el.playAgain.addEventListener('click', startRound);
el.changeTopic.addEventListener('click', goHome);
el.shareResult.addEventListener('click', () => lastShare && openShare(lastShare()));
el.shareTargets.addEventListener('click', (event) => {
  const link = event.target.closest('[data-copy-first]');
  if (link) copyText(t('instagramHint'));
});
el.shareCopy.addEventListener('click', () => copyText(t('copied')));
el.shareNative.addEventListener('click', shareNative);
el.shareClose.addEventListener('click', () => el.shareDialog.close());
el.dailyStart.addEventListener('click', startDaily);
el.dailyShare.addEventListener('click', shareDaily);
el.reviewStart.addEventListener('click', startReview);

// Klavye: 1-4 şık seçer, Enter sonraki soruya geçer. Kısayol tuşları ve form alanları hariç.
document.addEventListener('keydown', (event) => {
  if (!round || el.screens.round.hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target instanceof Element ? event.target : document.body;
  if (target.closest('select, input, textarea')) return;
  const number = Number(event.key);
  if (!round.answered && round.question.type !== 'order' && number >= 1 && number <= round.question.options.length) {
    const button = el.options.children[number - 1];
    if (!isBusy(button)) submit(number - 1);
  } else if (event.key === 'Enter' && round.answered && !target.closest('button')) {
    goNext();
  }
});

for (const button of el.langButtons) {
  button.addEventListener('click', () => {
    if (button.dataset.lang === settings.lang) return;
    settings.lang = button.dataset.lang;
    saveSettings(settings);
    renderLanguage();
    if (round) renderQuestionLabels();
  });
}

// Tur sürerken dil değişirse sadece arayüz etiketleri değişir; soru turun dilinde kalır.
function renderQuestionLabels() {
  el.roundCount.textContent = t('questionOf', { index: round.question.index + 1, total: round.question.total });
  if (round.answered && round.next) el.next.textContent = round.next.summary ? t('finish') : t('next');
  if (round.question.type === 'order' && !round.answered) renderOrder();
}

el.themeToggle.addEventListener('click', () => {
  settings.theme = nextTheme(settings.theme);
  saveSettings(settings);
  applyTheme(settings.theme);
});

applyTheme(settings.theme);
renderLanguage();