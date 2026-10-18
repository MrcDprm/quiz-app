// Birlikte oynama arayüzü: oda kurma ve katılma formları, sunucuyla bağlantı (Server-Sent Events) ve oda ekranları.
// Sunucu Oracle'da ayrı çalışır (live/server.js); bu modül ona fetch ve EventSource ile bağlanır.
// Kullanıcıya giden her metin textContent ile yazılır (XSS yok); takma adlar da öyle.
import { AREAS, DIFFICULTIES } from './topics.js';

export const LIVE_ORIGIN = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname)
  ? 'http://localhost:8787'
  : 'https://quiz-ws.miracdeprem.com';

const SESSION_KEY = 'room-session';
const PREFS_KEY = 'room-prefs';
const CODE = /^\d{6}$/;
const TIMEOUT_MS = 10_000;
const KNOWN_ERRORS = ['not_found', 'started', 'ended', 'full', 'name_taken', 'bad_name', 'rate_limited', 'busy', 'no_questions', 'no_players', 'closed', 'already_answered', 'bad_state'];

// Oda kurma seçenekleri (sunucudaki live/rooms.js SETTINGS ile aynı değerler)
const CHOICES = {
  count: [5, 10, 15, 20],
  seconds: [10, 20, 30, 60, 0],
  advance: ['manual', 'auto'],
};
const DEFAULTS = {
  count: 10, seconds: 20, advance: 'manual', questionOnPhones: true, revealOnPhones: true,
  leaderboardEach: true, speedBonus: true, hostPlays: true, lateJoin: false,
};

/** Tarayıcı deposu: gizli sekmede ya da kapalıyken sessizce boş döner. */
function readStored(key) {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
function writeStored(key, value) {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // depolama kapalı: oturum sadece bu sayfada kalır
  }
}

/** Kaydedilmiş oda tercihleri: bilinmeyen alanlar ve geçersiz değerler atılır. */
export function readPrefs(saved = readStored(PREFS_KEY)) {
  const prefs = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    const value = saved?.[key];
    if (CHOICES[key] ? CHOICES[key].includes(value) : typeof value === 'boolean') prefs[key] = value;
  }
  if (typeof saved?.name === 'string' && saved.name.length <= 20) prefs.name = saved.name;
  return prefs;
}

/** "/oda" → { code: null }, "/oda/482913" → { code }, diğerleri null. */
export function roomFromPath(pathname) {
  const match = /^\/oda(?:\/(\d{6}))?\/?$/.exec(pathname);
  return match ? { code: match[1] ?? null } : null;
}

/** Sunucuya JSON POST. Ağ hatası, zaman aşımı ve bilinmeyen hata tek bir koda iner. */
export async function livePost(path, body, fetchFn = fetch) {
  try {
    const response = await fetchFn(`${LIVE_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data) return { data };
    return { error: KNOWN_ERRORS.includes(data?.error) ? data.error : 'generic' };
  } catch {
    return { error: 'generic' };
  }
}

const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

/** "482913" → "482 913" (okuması ve söylemesi kolay) */
export const spacedCode = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

export function initRooms({ t, getLang, getSelection, showScreen, goHome }) {
  const $ = (id) => document.getElementById(id);
  const el = {
    tabs: $('room-tabs'),
    create: $('room-create'),
    join: $('room-join'),
    hostPlays: $('room-host-plays'),
    hostNameField: $('room-host-name-field'),
    hostName: $('room-host-name'),
    topic: $('room-topic'),
    advanceHint: $('room-advance-hint'),
    createSubmit: $('room-create-submit'),
    createStatus: $('room-create-status'),
    code: $('room-code'),
    joinName: $('room-join-name'),
    joinSubmit: $('room-join-submit'),
    joinStatus: $('room-join-status'),
    view: $('room-view'),
    connection: $('room-connection'),
  };

  const prefs = readPrefs();
  const selection = { ...getSelection() };
  let mode = 'create';
  let session = null; // { code, token }
  let state = null; // sunucudan gelen son durum
  let source = null;
  let notice = ''; // oda kapandı / çıkarıldın gibi son mesaj
  let retried = false; // bağlantı kapanınca bir kez daha denendi mi
  let retryTimer = null;

  const savePrefs = () => writeStored(PREFS_KEY, prefs);

  // ---------- Adres ----------

  function setPath(path) {
    const target = `${path}${getLang() === 'en' ? '?lang=en' : ''}`;
    if (`${location.pathname}${location.search}` !== target) history.pushState(null, '', target);
  }

  // ---------- Formlar ----------

  function renderTopicSelect() {
    el.topic.replaceChildren(
      ...Object.keys(AREAS).map((area) => {
        const group = document.createElement('optgroup');
        group.label = t(`area_${area}`);
        for (const topic of AREAS[area].topics) {
          const option = new Option(t(`topic_${topic}`), `${area}:${topic}`, false, area === selection.area && topic === selection.topic);
          group.append(option);
        }
        return group;
      }),
    );
  }

  const choiceLabel = (setting, value) => {
    if (setting === 'difficulty') return t(`difficulty_${value}`);
    if (setting === 'seconds') return value === 0 ? t('roomNoLimit') : `${value} ${t('roomSecondsShort')}`;
    if (setting === 'advance') return t(`roomAdvance_${value}`);
    return String(value);
  };

  function renderChoices() {
    for (const group of el.create.querySelectorAll('[data-setting]')) {
      const setting = group.dataset.setting;
      const values = setting === 'difficulty' ? DIFFICULTIES : CHOICES[setting];
      const current = setting === 'difficulty' ? selection.difficulty : prefs[setting];
      group.replaceChildren(
        ...values.map((value) => {
          const button = node('button', 'segment', choiceLabel(setting, value));
          button.type = 'button';
          button.setAttribute('role', 'radio');
          button.setAttribute('aria-checked', String(value === current));
          // Süresiz soruda geçiş elle olmak zorunda
          const disabled = setting === 'advance' && value === 'auto' && prefs.seconds === 0;
          button.disabled = disabled;
          button.dataset.value = String(value);
          return button;
        }),
      );
    }
    el.advanceHint.textContent = t(prefs.seconds === 0 ? 'roomAdvanceNoLimit' : `roomAdvanceHint_${prefs.advance}`);
    for (const toggle of el.create.querySelectorAll('[data-toggle]')) toggle.checked = prefs[toggle.dataset.toggle];
    el.hostPlays.checked = prefs.hostPlays;
    el.hostNameField.hidden = !prefs.hostPlays;
  }

  function renderForms() {
    for (const tab of el.tabs.children) {
      const active = tab.dataset.tab === mode;
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('aria-checked', String(active)); // .segment stili için
    }
    el.create.hidden = mode !== 'create';
    el.join.hidden = mode !== 'join';
    renderTopicSelect();
    renderChoices();
    if (prefs.name && !el.hostName.value) el.hostName.value = prefs.name;
    if (prefs.name && !el.joinName.value) el.joinName.value = prefs.name;
  }

  function openEntry(nextMode = 'create', code = null) {
    mode = nextMode;
    Object.assign(selection, getSelection());
    if (code) el.code.value = code;
    el.createStatus.textContent = notice;
    el.joinStatus.textContent = notice;
    notice = '';
    renderForms();
    setPath(code ? `/oda/${code}` : '/oda');
    showScreen('roomEntry');
    (mode === 'join' ? (el.code.value ? el.joinName : el.code) : el.createSubmit).focus();
  }

  async function createRoom() {
    if (el.createSubmit.disabled) return;
    const name = el.hostName.value.trim();
    if (prefs.hostPlays && !name) {
      el.createStatus.textContent = t('room_error_bad_name');
      el.hostName.focus();
      return;
    }
    const [area, topic] = el.topic.value.split(':');
    el.createSubmit.disabled = true;
    el.createStatus.textContent = t('loading');
    const settings = Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, prefs[key]]));
    const { data, error } = await livePost('/rooms', { area, topic, difficulty: selection.difficulty, lang: getLang(), settings, name });
    el.createSubmit.disabled = false;
    if (error) {
      el.createStatus.textContent = t(`room_error_${error}`);
      return;
    }
    el.createStatus.textContent = '';
    if (name) prefs.name = name;
    savePrefs();
    enter(data.code, data.token);
  }

  async function joinRoom() {
    if (el.joinSubmit.disabled) return;
    const code = el.code.value.replace(/\D/g, '');
    if (!CODE.test(code)) {
      el.joinStatus.textContent = t('room_error_bad_code');
      el.code.focus();
      return;
    }
    // Bu odaya bu tarayıcıdan zaten katılındıysa yeniden bağlanılır
    const saved = readStored(SESSION_KEY);
    if (saved?.code === code && typeof saved.token === 'string') return enter(code, saved.token);
    const name = el.joinName.value.trim();
    el.joinSubmit.disabled = true;
    el.joinStatus.textContent = t('loading');
    const { data, error } = await livePost(`/rooms/${code}/join`, { name });
    el.joinSubmit.disabled = false;
    if (error) {
      el.joinStatus.textContent = t(`room_error_${error}`);
      return;
    }
    el.joinStatus.textContent = '';
    prefs.name = name;
    savePrefs();
    enter(code, data.token);
  }

  // ---------- Bağlantı ----------

  function enter(code, token) {
    session = { code, token };
    writeStored(SESSION_KEY, session);
    state = null;
    setPath(`/oda/${code}`);
    showScreen('room');
    el.view.replaceChildren(node('p', 'room-waiting', t('loading')));
    connect();
  }

  function connect() {
    source?.close();
    const { code, token } = session;
    source = new EventSource(`${LIVE_ORIGIN}/rooms/${code}/events?token=${encodeURIComponent(token)}`);
    source.onmessage = (event) => {
      try {
        state = JSON.parse(event.data);
      } catch {
        return;
      }
      retried = false;
      el.connection.textContent = '';
      render();
    };
    // Moderatör bu oyuncuyu çıkardı
    source.addEventListener('gone', () => close(t('roomGone')));
    source.onerror = () => {
      el.connection.textContent = t('roomReconnecting');
      if (source.readyState !== EventSource.CLOSED) return; // tarayıcı kendisi yeniden bağlanır
      // Sunucu bağlantıyı kabul etmedi (oda yok ya da sunucu yeniden başladı). Hemen "oda kapandı" denmez:
      // sayfa yenilenirken de bağlantı bu şekilde kapanır ve oturum silinirse yeni sayfa odaya dönemez.
      // Kısa bir süre sonra bir kez daha denenir; o da olmazsa oda gerçekten kapanmıştır.
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (!session) return;
        if (retried) return close(state ? t('roomClosed') : t('room_error_not_found'));
        retried = true;
        connect();
      }, 1500);
    };
  }

  function close(message) {
    stopTimer();
    clearTimeout(retryTimer);
    source?.close();
    source = null;
    session = null;
    state = null;
    writeStored(SESSION_KEY, null);
    notice = message;
    openEntry('join');
  }

  function leave() {
    stopTimer();
    clearTimeout(retryTimer);
    source?.close();
    source = null;
    session = null;
    state = null;
    writeStored(SESSION_KEY, null);
    goHome();
  }

  async function command(action, target) {
    if (!session) return;
    const { error } = await livePost(`/rooms/${session.code}/command`, { token: session.token, action, target });
    if (error) el.connection.textContent = t(`room_error_${error}`);
  }

  // ---------- Oda ekranı ----------

  function button(className, text, onClick) {
    const element = node('button', className, text);
    element.type = 'button';
    element.addEventListener('click', onClick);
    return element;
  }

  function header() {
    const bar = node('div', 'room-bar');
    bar.append(node('span', 'room-bar-code', `${t('roomCode')} ${spacedCode(state.code)}`));
    const topic = t(`topic_${state.selection.topic}`);
    bar.append(node('span', 'room-bar-topic', `${topic} · ${t(`difficulty_${state.selection.difficulty}`)}`));
    return bar;
  }

  async function shareLink() {
    const url = `${location.origin}/oda/${state.code}${state.lang === 'en' ? '?lang=en' : ''}`;
    const text = t('roomShareText', { code: spacedCode(state.code) });
    try {
      if (navigator.share) await navigator.share({ text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        el.connection.textContent = t('roomCopied');
      }
    } catch {
      // paylaşım menüsü kapatıldı
    }
  }

  function renderLobby() {
    const isHost = state.role === 'host';
    const parts = [header()];
    if (isHost) {
      parts.push(node('p', 'room-lead', t('roomLobbyHost')));
      parts.push(node('p', 'room-code-big', spacedCode(state.code)));
      parts.push(button('btn btn-secondary btn-wide', t('roomShare'), shareLink));
    } else {
      parts.push(node('p', 'room-lead', t('roomLobbyPlayer', { name: state.you?.name ?? '' })));
    }
    const players = state.players;
    parts.push(node('h2', 'room-subtitle', t('roomPlayers', { count: players.length })));
    if (players.length === 0) parts.push(node('p', 'room-empty', t('roomNoPlayers')));
    const list = node('ul', 'room-players');
    for (const player of players) {
      const item = node('li', player.id === state.you?.id ? 'room-player you' : 'room-player');
      item.append(node('span', 'room-player-name', player.name));
      if (isHost && player.id !== state.you?.id) {
        const kick = button('room-kick', '×', () => command('kick', player.id));
        kick.setAttribute('aria-label', t('roomKick', { name: player.name }));
        item.append(kick);
      }
      list.append(item);
    }
    parts.push(list);
    if (isHost) {
      const start = button('btn btn-primary btn-wide', t('roomStart'), () => command('start'));
      start.disabled = players.length === 0;
      parts.push(start);
    }
    parts.push(button('btn btn-ghost room-leave', t('roomLeave'), leave));
    el.view.replaceChildren(...parts);
  }

  // ---------- Soru ve süre ----------

  // Her şıkkın rengi ve şekli: renk görmeyen de şekilden ayırt eder
  const SHAPES = ['▲', '◆', '●', '■'];
  let clockOffset = 0; // sunucu saati − bu cihazın saati
  let timerId = null;
  let sending = false; // cevap gönderiliyor

  const isHost = () => state.role === 'host';
  const plays = () => Boolean(state.you);

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  /** Süre çubuğu: kalan süre sunucunun saatine göre hesaplanır (cihaz saati yanlış olsa da doğru). */
  function timerBar() {
    const { question, paused } = state;
    const wrap = node('div', 'room-timer');
    if (question.deadline === null && question.remainingMs === null) {
      wrap.append(node('span', 'room-timer-text', t('roomNoLimit')));
      return wrap;
    }
    const total = state.settings.seconds * 1000;
    const bar = node('div', 'timer');
    bar.append(node('span', 'timer-fill'));
    const text = node('span', 'room-timer-text');
    wrap.append(bar, text);
    const update = () => {
      const left = paused || !question.deadline
        ? question.remainingMs ?? 0
        : Math.max(0, question.deadline - (Date.now() + clockOffset));
      bar.style.setProperty('--left', String(Math.min(1, left / total)));
      bar.classList.toggle('low', left <= 5000);
      text.textContent = paused ? t('roomPaused') : t('roomSecondsLeft', { seconds: Math.ceil(left / 1000) });
    };
    update();
    if (!paused) timerId = setInterval(update, 200);
    return wrap;
  }

  function questionBody() {
    const { question } = state;
    const parts = [];
    if (question.prompt) parts.push(node('h2', 'prompt room-prompt', question.prompt));
    if (question.image) {
      const image = node('img', 'question-image');
      image.src = question.image;
      image.alt = t('flagAlt');
      parts.push(image);
    }
    if (question.code) parts.push(node('pre', 'code', question.code));
    if (!question.prompt && plays()) parts.push(node('p', 'room-lead', t('roomLookAtScreen')));
    return parts;
  }

  async function sendAnswer(choice) {
    if (!session || sending || state.phase !== 'question' || state.paused || state.you?.answered) return;
    sending = true;
    state.you = { ...state.you, answered: true, choice }; // hemen işaretlenir; sunucu durumu birazdan gelir
    render();
    const { error } = await livePost(`/rooms/${session.code}/answer`, { token: session.token, choice });
    sending = false;
    if (error) el.connection.textContent = t(`room_error_${error}`);
  }

  /** Şıklar: soru aşamasında düğme, sonuçta doğru/yanlış ve kaç kişinin seçtiği. */
  function options() {
    const { question, phase, you } = state;
    const grid = node('div', question.options ? 'room-options' : 'room-options shapes-only');
    const answerable = phase === 'question' && plays() && !you.answered && !state.paused;
    for (let i = 0; i < question.optionCount; i++) {
      const option = node('button', `room-option opt-${i}`);
      option.type = 'button';
      option.append(node('span', 'room-shape', SHAPES[i]));
      if (question.options) option.append(node('span', 'room-option-text', question.options[i]));
      option.setAttribute('aria-label', `${i + 1}. ${question.options?.[i] ?? SHAPES[i]}`);
      if (phase === 'reveal') {
        if (question.answer === i) option.classList.add('correct');
        else if (you?.choice === i) option.classList.add('wrong');
        option.append(node('span', 'room-count', String(question.counts?.[i] ?? 0)));
      }
      if (you?.choice === i) option.classList.add('chosen');
      option.disabled = !answerable;
      if (answerable) option.addEventListener('click', () => sendAnswer(i));
      grid.append(option);
    }
    return grid;
  }

  function hostTools() {
    const tools = node('div', 'room-tools');
    if (['question', 'reveal', 'leaderboard'].includes(state.phase)) {
      tools.append(button('btn btn-ghost', state.paused ? t('roomResume') : t('roomPause'), () => command(state.paused ? 'resume' : 'pause')));
    }
    if (state.phase === 'question') tools.append(button('btn btn-ghost', t('roomSkip'), () => command('skip')));
    tools.append(
      button('btn btn-ghost room-end', t('roomEnd'), () => {
        if (window.confirm(t('roomEndConfirm'))) command('end');
      }),
    );
    return tools;
  }

  function progress() {
    const bar = node('div', 'round-bar');
    bar.append(node('span', 'round-count', t('questionOf', { index: state.question.index + 1, total: state.question.total })));
    if (plays()) bar.append(node('span', 'round-score', t('roomPoints', { score: state.you.score })));
    return bar;
  }

  function renderQuestion() {
    const parts = [progress(), timerBar(), ...questionBody(), options()];
    if (state.paused) parts.push(node('p', 'room-paused', t('roomPaused')));
    else if (plays() && state.you.answered) parts.push(node('p', 'room-status', t('roomSentAnswer')));
    if (isHost()) {
      parts.push(node('p', 'room-status', t('roomAnswered', { count: state.answeredCount, total: state.players.length })));
      if (!state.paused) parts.push(button('btn btn-secondary btn-wide', t('roomRevealNow'), () => command('reveal')));
      parts.push(hostTools());
    }
    el.view.replaceChildren(...parts);
  }

  function nextLabel() {
    const last = state.question ? state.question.index + 1 >= state.question.total : false;
    if (state.phase === 'reveal' && state.settings.leaderboardEach && !last) return t('roomShowRanking');
    return last ? t('roomShowResults') : t('roomNextQuestion');
  }

  function waitingLine() {
    if (state.paused) return node('p', 'room-paused', t('roomPaused'));
    return node('p', 'room-status', t(state.settings.advance === 'auto' ? 'roomAutoNext' : 'roomWaitHost'));
  }

  function renderReveal() {
    const { question, you } = state;
    const parts = [progress(), ...questionBody(), options()];
    if (question.skipped) parts.push(node('p', 'room-status', t('roomSkipped')));
    else if (you?.last) {
      const { correct, answered, points } = you.last;
      const verdict = correct ? t('roomCorrect', { points }) : answered ? t('roomWrong') : t('roomNoAnswer');
      parts.push(node('p', correct ? 'room-verdict good' : 'room-verdict bad', verdict));
      parts.push(node('p', 'room-status', t('roomYourRank', { rank: you.rank, score: you.score })));
    }
    if (question.explain) parts.push(node('p', 'explain room-explain', question.explain));
    if (isHost()) {
      if (state.settings.advance === 'manual' && !state.paused) parts.push(button('btn btn-primary btn-wide', nextLabel(), () => command('next')));
      else parts.push(waitingLine());
      parts.push(hostTools());
    } else {
      parts.push(waitingLine());
    }
    el.view.replaceChildren(...parts);
  }

  /** Sıralama listesi: ilk 10; oyuncu ilk 10'da değilse kendi satırı en altta. */
  function rankingList(limit = 10) {
    const list = node('ol', 'room-ranking');
    const ranking = state.ranking ?? [];
    const rows = ranking.slice(0, limit);
    const mine = state.you && ranking.find((row) => row.id === state.you.id);
    if (mine && mine.rank > limit) rows.push(mine);
    for (const row of rows) {
      const item = node('li', row.id === state.you?.id ? 'room-rank you' : 'room-rank');
      item.append(node('span', 'room-rank-place', row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : `${row.rank}.`));
      item.append(node('span', 'room-rank-name', row.name));
      item.append(node('span', 'room-rank-score', String(row.score)));
      list.append(item);
    }
    return list;
  }

  function renderLeaderboard() {
    const parts = [header(), node('h2', 'room-subtitle', t('roomRanking')), rankingList()];
    if (isHost()) {
      if (state.settings.advance === 'manual' && !state.paused) parts.push(button('btn btn-primary btn-wide', t('roomNextQuestion'), () => command('next')));
      else parts.push(waitingLine());
      parts.push(hostTools());
    } else {
      parts.push(waitingLine());
    }
    el.view.replaceChildren(...parts);
  }

  function renderFinal() {
    const parts = [header(), node('h2', 'room-final-title', t('roomFinal'))];
    if (state.you) parts.push(node('p', 'room-lead', t('roomYourRank', { rank: state.you.rank, score: state.you.score })));
    parts.push(rankingList(30));
    const actions = node('div', 'room-final-actions');
    if (isHost()) actions.append(button('btn btn-primary', t('roomNewRoom'), () => { leaveQuietly(); openEntry('create'); }));
    actions.append(button('btn btn-secondary', t('backHome'), leave));
    parts.push(actions);
    el.view.replaceChildren(...parts);
  }

  /** Oturumu bitirir ama ana sayfaya gitmez (aynı ekrandan yeni oda kurulur). */
  function leaveQuietly() {
    stopTimer();
    clearTimeout(retryTimer);
    source?.close();
    source = null;
    session = null;
    state = null;
    writeStored(SESSION_KEY, null);
  }

  const RENDERERS = {
    lobby: renderLobby,
    question: renderQuestion,
    reveal: renderReveal,
    leaderboard: renderLeaderboard,
    final: renderFinal,
  };

  function render() {
    if (!state) return;
    stopTimer();
    clockOffset = state.serverNow - Date.now();
    (RENDERERS[state.phase] ?? renderLobby)();
  }

  // Klavye: 1-4 şık seçer (masaüstünde)
  document.addEventListener('keydown', (event) => {
    if (!state || state.phase !== 'question' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
    const number = Number(event.key);
    if (number >= 1 && number <= state.question.optionCount) sendAnswer(number - 1);
  });

  // ---------- Olaylar ----------

  el.tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (!tab) return;
    mode = tab.dataset.tab;
    renderForms();
  });
  el.create.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-value]');
    const group = choice?.closest('[data-setting]');
    if (!choice || !group || choice.disabled) return;
    const setting = group.dataset.setting;
    const value = setting === 'advance' || setting === 'difficulty' ? choice.dataset.value : Number(choice.dataset.value);
    if (setting === 'difficulty') selection.difficulty = value;
    else prefs[setting] = value;
    if (setting === 'seconds' && value === 0) prefs.advance = 'manual';
    savePrefs();
    renderChoices();
  });
  // Sadece anahtar, "ben de oynuyorum" ve kategori değişikliği işlenir. Ad alanı odağı kaybedince de
  // "change" gelir; o an düğmeler yeniden çizilirse kullanıcının tam o sırada yaptığı dokunuş kaybolur.
  el.create.addEventListener('change', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) prefs[toggle.dataset.toggle] = toggle.checked;
    else if (event.target === el.hostPlays) {
      prefs.hostPlays = el.hostPlays.checked;
      el.hostNameField.hidden = !prefs.hostPlays;
    } else if (event.target === el.topic) [selection.area, selection.topic] = el.topic.value.split(':');
    else return;
    savePrefs();
  });
  el.create.addEventListener('submit', (event) => {
    event.preventDefault();
    createRoom();
  });
  el.join.addEventListener('submit', (event) => {
    event.preventDefault();
    joinRoom();
  });
  el.code.addEventListener('input', () => {
    el.code.value = el.code.value.replace(/\D/g, '').slice(0, 6);
  });

  return {
    openEntry,
    /** Sayfa /oda ya da /oda/123456 ile açıldıysa: kayıtlı oturum o odaya aitse bağlanır, değilse katılma formu. */
    openFromPath(route) {
      const saved = readStored(SESSION_KEY);
      if (route.code && saved?.code === route.code && typeof saved.token === 'string') return enter(saved.code, saved.token);
      return openEntry(route.code ? 'join' : 'create', route.code);
    },
    /** Dil değişince ekran yeni dilde yeniden çizilir. */
    refresh() {
      if (state) render();
      else renderForms();
    },
    get active() {
      return Boolean(session);
    },
    /** Odadan sayfa içinde ayrılınca bağlantı kapanır ama oturum saklı kalır; /oda/kod ile geri dönülebilir. */
    suspend() {
      stopTimer();
      clearTimeout(retryTimer);
      source?.close();
      source = null;
      session = null;
      state = null;
    },
    leave,
  };
}
