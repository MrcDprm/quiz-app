// Arayüz: tur ayarı, soru ekranı, süre çubuğu ve sonuç. Kurallar ve cevaplar sunucuda (bkz. lib/).
import { AREAS, LEVELS } from './topics.js';
import { loadSettings, saveSettings, topicsOf } from './storage.js';
import { translate } from './i18n.js';
import { applyTheme, nextTheme } from './theme.js';
import { post } from './api-client.js';

const browserLang = navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
const settings = loadSettings(undefined, browserLang);
const t = (key, params) => translate(settings.lang, key, params);

const $ = (id) => document.getElementById(id);
const el = {
  screens: { setup: $('setup-screen'), round: $('round-screen'), result: $('result-screen') },
  setupForm: $('setup-form'),
  areaGroup: $('area-group'),
  topic: $('topic'),
  level: $('level'),
  start: $('start'),
  setupStatus: $('setup-status'),
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
  resultScore: $('result-score'),
  resultCorrect: $('result-correct'),
  resultGrid: $('result-grid'),
  review: $('review'),
  playAgain: $('play-again'),
  changeTopic: $('change-topic'),
  themeToggle: $('theme-toggle'),
  langButtons: document.querySelectorAll('[data-lang]'),
};

// Açık turun istemcideki kopyası. Doğru cevap burada hiçbir zaman cevaptan önce bulunmaz.
let round = null;
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
}

// Alan ya da seviye değişince seçili konu artık sunulmuyorsa listenin ilk konusuna geçilir.
function updateSelection(changes) {
  Object.assign(settings, changes);
  const topics = topicsOf(settings.area, settings.level);
  if (!topics.includes(settings.topic)) settings.topic = topics[0];
  saveSettings(settings);
  renderSetup();
}

async function startRound() {
  if (isBusy(el.start)) return;
  setBusy(el.start, true);
  el.setupStatus.textContent = t('loading');
  const { area, topic, level, lang } = settings;
  const { data, error } = await post('/api/round', { area, topic, level, lang });
  setBusy(el.start, false);
  if (error) {
    el.setupStatus.textContent = t(`error_${error}`);
    showScreen('setup'); // "Yeni tur" sonuç ekranından basıldıysa mesaj görünsün
    return;
  }
  el.setupStatus.textContent = '';
  round = { token: data.token, question: data.question, score: data.score, history: [], answered: false, busy: false };
  showScreen('round');
  renderQuestion();
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
  back.addEventListener('click', () => showScreen('setup'));
  el.feedback.append(back);
  back.focus();
}

// ---------- Sonuç ----------

function answerText(question, answer) {
  if (answer === null) return t('noAnswer');
  if (question.type === 'order') return answer.map((i) => question.items[i]).join(' → ');
  return question.options[answer];
}

function showResult(summary) {
  stopTimer();
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
  el.playAgain.focus();
}

// ---------- Dil ve tema ----------

function renderLanguage() {
  document.documentElement.lang = settings.lang;
  document.title = t('pageTitle');
  for (const item of document.querySelectorAll('[data-i18n]')) item.textContent = t(item.dataset.i18n);
  for (const item of document.querySelectorAll('[data-i18n-aria]')) item.setAttribute('aria-label', t(item.dataset.i18nAria));
  for (const button of el.langButtons) button.setAttribute('aria-pressed', String(button.dataset.lang === settings.lang));
  renderSetup();
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
el.changeTopic.addEventListener('click', () => showScreen('setup'));

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