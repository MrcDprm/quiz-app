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
const KNOWN_ERRORS = ['not_found', 'started', 'ended', 'full', 'name_taken', 'bad_name', 'rate_limited', 'busy', 'no_questions', 'no_players'];

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

  // Diğer aşamalar (soru, sonuç, sıralama, final) bir sonraki parçada bu tabloya eklenir.
  const RENDERERS = { lobby: renderLobby };

  function render() {
    if (!state) return;
    (RENDERERS[state.phase] ?? renderLobby)();
  }

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
  el.create.addEventListener('change', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) prefs[toggle.dataset.toggle] = toggle.checked;
    if (event.target === el.hostPlays) prefs.hostPlays = el.hostPlays.checked;
    if (event.target === el.topic) [selection.area, selection.topic] = el.topic.value.split(':');
    savePrefs();
    renderChoices();
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
      clearTimeout(retryTimer);
      source?.close();
      source = null;
      session = null;
      state = null;
    },
    leave,
  };
}
