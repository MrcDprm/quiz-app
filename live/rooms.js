// Birlikte oynama: odalar, oyuncular, sorular, süre ve puan. Ağdan bağımsız saf mantık.
// Saat (now) ve rastgele baytlar (randomBytes) dışarıdan verilir; testler zamanı ileri sarabilir.
// Cevaplar sonuç gösterilene kadar hiçbir oyuncuya gitmez; puanı sunucu, sunucunun saatiyle hesaplar.

export const MAX_PLAYERS = 30;
export const MAX_ROOMS = 200;
export const IDLE_MS = 30 * 60 * 1000;
const NAME_MAX = 20;
const REVEAL_MS = 6000; // otomatik geçişte sonucun ekranda kalma süresi
const LEADERBOARD_MS = 5000;
const BASE_POINTS = 500;
const SPEED_POINTS = 500;

// Oda kurulurken seçilebilen her ayar ve varsayılanı. Değer listede yoksa varsayılan kullanılır.
export const SETTINGS = {
  count: { values: [5, 10, 15, 20], default: 10 },
  seconds: { values: [10, 20, 30, 60, 0], default: 20 }, // 0 = süresiz (sadece elle geçişte)
  advance: { values: ['manual', 'auto'], default: 'manual' },
  questionOnPhones: { values: [true, false], default: true },
  leaderboardEach: { values: [true, false], default: true },
  speedBonus: { values: [true, false], default: true },
  hostPlays: { values: [true, false], default: true },
  lateJoin: { values: [false, true], default: false },
  revealOnPhones: { values: [true, false], default: true },
};

export const PHASES = ['lobby', 'question', 'reveal', 'leaderboard', 'final'];

/** İstemciden gelen ayarları doğrular; bilinmeyen alan atılır, geçersiz değer varsayılana döner. */
export function normalizeSettings(input = {}) {
  const settings = {};
  for (const [key, { values, default: fallback }] of Object.entries(SETTINGS)) {
    settings[key] = values.includes(input?.[key]) ? input[key] : fallback;
  }
  // Süresiz soru otomatik geçişle olmaz: süre bitmeden sonraki soruya geçilemez
  if (settings.seconds === 0) settings.advance = 'manual';
  return settings;
}

/** Takma ad: baştaki/sondaki boşluk atılır; harf, rakam, boşluk ve birkaç işaret; 1-20 karakter. */
export function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= NAME_MAX && /^[\p{L}\p{N} ._'-]+$/u.test(name) ? name : null;
}

const sameName = (a, b) => a.toLocaleLowerCase('tr') === b.toLocaleLowerCase('tr');

/**
 * Oda yöneticisi.
 * loadQuestions(selection) → [{ type, prompt, options, answer, explain, image?, code? }]
 * onChange(room): odada bir şey değişince çağrılır (sunucu bağlı tarayıcılara yeni durumu gönderir).
 */
export function createRooms({ now = Date.now, randomBytes, loadQuestions, onChange = () => {} }) {
  const rooms = new Map();

  const token = () => randomBytes(24).toString('base64url');
  const id = () => randomBytes(6).toString('base64url');

  function newCode() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = String(randomBytes(4).readUInt32BE(0) % 900000 + 100000);
      if (!rooms.has(code)) return code;
    }
    return null;
  }

  const touch = (room) => {
    room.lastActivity = now();
    onChange(room);
  };

  const activePlayers = (room) => [...room.players.values()].filter((player) => !player.kicked);
  const limitMs = (room) => room.settings.seconds * 1000;

  function addPlayer(room, name) {
    const player = { id: id(), token: token(), name, score: 0, kicked: false, joinedAt: now(), last: null };
    room.players.set(player.id, player);
    return player;
  }

  function startQuestion(room) {
    room.phase = 'question';
    room.answers = new Map();
    room.skipped = false;
    room.shownAt = now();
    room.deadline = room.settings.seconds ? now() + limitMs(room) : null;
    room.nextAt = null;
  }

  // Sonuç: puanlar burada, sunucunun ölçtüğü süreyle hesaplanır.
  function reveal(room, { skipped = false } = {}) {
    const question = room.questions[room.index];
    room.phase = 'reveal';
    room.skipped = skipped;
    for (const player of activePlayers(room)) {
      const given = room.answers.get(player.id);
      const correct = !skipped && given !== undefined && given.choice === question.answer;
      let points = 0;
      if (correct) {
        const limit = limitMs(room);
        const remaining = limit ? Math.max(0, limit - (given.at - room.shownAt)) : 0;
        points = room.settings.speedBonus && limit ? BASE_POINTS + Math.round((SPEED_POINTS * remaining) / limit) : BASE_POINTS + SPEED_POINTS;
      }
      player.score += points;
      player.last = { answered: given !== undefined, correct, points };
    }
    room.deadline = null;
    room.nextAt = room.settings.advance === 'auto' ? now() + REVEAL_MS : null;
  }

  function advance(room) {
    if (room.phase === 'reveal' && room.settings.leaderboardEach && room.index < room.questions.length - 1) {
      room.phase = 'leaderboard';
      room.nextAt = room.settings.advance === 'auto' ? now() + LEADERBOARD_MS : null;
      return;
    }
    if (room.index >= room.questions.length - 1) {
      room.phase = 'final';
      room.nextAt = null;
      return;
    }
    room.index += 1;
    startQuestion(room);
  }

  const everyoneAnswered = (room) => {
    const players = activePlayers(room);
    return players.length > 0 && players.every((player) => room.answers.has(player.id));
  };

  function find(code, tokenValue) {
    const room = rooms.get(code);
    if (!room) return { error: 'not_found' };
    if (room.host.token === tokenValue) return { room, role: 'host', player: room.host.playerId ? room.players.get(room.host.playerId) : null };
    const player = [...room.players.values()].find((item) => item.token === tokenValue);
    if (!player || player.kicked) return { error: 'not_found' };
    return { room, role: 'player', player };
  }

  return {
    rooms,

    /** Oda kurar. Moderatör de oynuyorsa hostName ile oyuncu olarak eklenir. */
    async create({ area, topic, difficulty, lang }, rawSettings, hostName) {
      if (rooms.size >= MAX_ROOMS) return { error: 'busy' };
      const settings = normalizeSettings(rawSettings);
      const name = settings.hostPlays ? cleanName(hostName) : null;
      if (settings.hostPlays && !name) return { error: 'bad_name' };
      const questions = await loadQuestions({ area, topic, difficulty, lang, count: settings.count });
      if (!questions || questions.length === 0) return { error: 'no_questions' };
      const code = newCode();
      if (!code) return { error: 'busy' };
      const room = {
        code,
        lang,
        selection: { area, topic, difficulty },
        settings,
        host: { token: token(), playerId: null },
        players: new Map(),
        questions,
        phase: 'lobby',
        index: 0,
        answers: new Map(),
        paused: null,
        deadline: null,
        nextAt: null,
        createdAt: now(),
        lastActivity: now(),
      };
      if (name) room.host.playerId = addPlayer(room, name).id;
      rooms.set(code, room);
      touch(room);
      return { room, token: room.host.token };
    },

    join(code, rawName) {
      const room = rooms.get(code);
      if (!room) return { error: 'not_found' };
      if (room.phase === 'final') return { error: 'ended' };
      if (room.phase !== 'lobby' && !room.settings.lateJoin) return { error: 'started' };
      const name = cleanName(rawName);
      if (!name) return { error: 'bad_name' };
      const players = activePlayers(room);
      if (players.length >= MAX_PLAYERS) return { error: 'full' };
      if (players.some((player) => sameName(player.name, name))) return { error: 'name_taken' };
      const player = addPlayer(room, name);
      touch(room);
      return { room, player, token: player.token };
    },

    find,

    /** Oyuncunun cevabı; her soruda bir kez, süre içinde ve geçerli bir şıkla. */
    answer(code, tokenValue, choice) {
      const { room, player, error } = find(code, tokenValue);
      if (error) return { error };
      if (!player) return { error: 'forbidden' };
      if (room.phase !== 'question' || room.paused) return { error: 'closed' };
      if (room.deadline && now() > room.deadline) return { error: 'closed' };
      const question = room.questions[room.index];
      if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) return { error: 'bad_request' };
      if (room.answers.has(player.id)) return { error: 'already_answered' };
      room.answers.set(player.id, { choice, at: now() });
      if (everyoneAnswered(room)) reveal(room);
      touch(room);
      return { ok: true };
    },

    /** Moderatör komutları: start, next, reveal (süresiz soruda), pause, resume, skip, end, kick. */
    command(code, tokenValue, action, target) {
      const { room, role, error } = find(code, tokenValue);
      if (error) return { error };
      if (role !== 'host') return { error: 'forbidden' };
      switch (action) {
        case 'start':
          if (room.phase !== 'lobby') return { error: 'bad_state' };
          if (activePlayers(room).length === 0) return { error: 'no_players' };
          room.index = 0;
          startQuestion(room);
          break;
        case 'reveal':
          if (room.phase !== 'question' || room.paused) return { error: 'bad_state' };
          reveal(room);
          break;
        case 'next':
          if (room.phase !== 'reveal' && room.phase !== 'leaderboard') return { error: 'bad_state' };
          advance(room);
          break;
        case 'skip':
          if (room.phase !== 'question') return { error: 'bad_state' };
          room.paused = null;
          reveal(room, { skipped: true });
          break;
        case 'pause':
          if (room.paused || !['question', 'reveal', 'leaderboard'].includes(room.phase)) return { error: 'bad_state' };
          // Kalan süreler saklanır; devam edince yeniden kurulur
          room.paused = {
            deadline: room.deadline ? Math.max(0, room.deadline - now()) : null,
            nextAt: room.nextAt ? Math.max(0, room.nextAt - now()) : null,
          };
          room.deadline = null;
          room.nextAt = null;
          break;
        case 'resume':
          if (!room.paused) return { error: 'bad_state' };
          if (room.paused.deadline !== null) {
            // Duraklatılan süre kadar soru daha geç gösterilmiş sayılır (hız puanı adil kalsın)
            const elapsed = limitMs(room) - room.paused.deadline;
            room.shownAt = now() - elapsed;
            room.deadline = now() + room.paused.deadline;
          }
          if (room.paused.nextAt !== null) room.nextAt = now() + room.paused.nextAt;
          room.paused = null;
          break;
        case 'end':
          if (room.phase === 'final') return { error: 'bad_state' };
          room.phase = 'final';
          room.paused = null;
          room.deadline = null;
          room.nextAt = null;
          break;
        case 'kick': {
          const player = room.players.get(target);
          if (!player || player.kicked || player.id === room.host.playerId) return { error: 'bad_request' };
          player.kicked = true;
          room.answers.delete(player.id);
          if (room.phase === 'question' && everyoneAnswered(room)) reveal(room);
          break;
        }
        default:
          return { error: 'bad_request' };
      }
      touch(room);
      return { ok: true };
    },

    /** Saat ilerlediğinde: süresi biten soru sonuçlanır, otomatik geçişte sıradaki ekrana geçilir, boş odalar silinir. */
    tick() {
      for (const room of rooms.values()) {
        if (now() - room.lastActivity > IDLE_MS) {
          rooms.delete(room.code);
          onChange(room); // sunucu bu odanın açık bağlantılarını kapatır
          continue;
        }
        if (room.paused) continue;
        if (room.phase === 'question' && room.deadline && now() >= room.deadline) {
          reveal(room);
          touch(room);
        } else if (room.nextAt && now() >= room.nextAt) {
          advance(room);
          touch(room);
        }
      }
    },

    /** Bir izleyicinin göreceği durum. Cevap ve açıklama sadece sonuç ekranında, ayarlar izin veriyorsa gider. */
    view(room, role, player) {
      const isHost = role === 'host';
      const question = room.questions[room.index];
      const inQuestion = room.phase === 'question' || room.phase === 'reveal';
      const showQuestion = isHost || room.settings.questionOnPhones;
      const showAnswer = room.phase === 'reveal' && (isHost || room.settings.revealOnPhones);
      const ranking = activePlayers(room)
        .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
        .map((item, index) => ({ id: item.id, name: item.name, score: item.score, rank: index + 1 }));
      const counts = question.options.map((_, i) => [...room.answers.values()].filter((given) => given.choice === i).length);
      return {
        code: room.code,
        role,
        phase: room.phase,
        lang: room.lang,
        selection: room.selection,
        settings: room.settings,
        paused: Boolean(room.paused),
        serverNow: now(),
        players: ranking.map(({ id: playerId, name }) => ({ id: playerId, name, answered: room.phase === 'question' && room.answers.has(playerId) })),
        answeredCount: room.answers.size,
        question: inQuestion
          ? {
              index: room.index,
              total: room.questions.length,
              type: question.type,
              optionCount: question.options.length,
              ...(showQuestion && {
                prompt: question.prompt,
                options: question.options,
                ...(question.image && { image: question.image }),
                ...(question.code && { code: question.code }),
              }),
              deadline: room.deadline,
              remainingMs: room.paused?.deadline ?? (room.deadline ? Math.max(0, room.deadline - now()) : null),
              skipped: room.phase === 'reveal' && room.skipped,
              ...(showAnswer && { answer: question.answer, explain: question.explain }),
              ...(room.phase === 'reveal' && { counts }),
            }
          : null,
        ranking: ['leaderboard', 'final'].includes(room.phase) || (isHost && room.phase === 'lobby') ? ranking : null,
        you: player
          ? {
              id: player.id,
              name: player.name,
              score: player.score,
              rank: ranking.find((item) => item.id === player.id)?.rank ?? null,
              answered: room.answers.has(player.id),
              choice: room.answers.get(player.id)?.choice ?? null,
              last: room.phase === 'reveal' ? player.last : null,
            }
          : null,
      };
    },
  };
}
