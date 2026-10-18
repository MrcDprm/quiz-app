// Birlikte oynama: oda, katılma, süre, puan, duraklatma, moderatör komutları ve görünürlük kuralları.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cleanName, createRooms, MAX_PLAYERS, normalizeSettings, IDLE_MS } from '../live/rooms.js';

const QUESTIONS = Array.from({ length: 3 }, (_, i) => ({
  type: 'choice',
  prompt: `Soru ${i + 1}`,
  options: ['a', 'b', 'c', 'd'],
  answer: 1,
  explain: `Açıklama ${i + 1}`,
}));
const SELECTION = { area: 'general', topic: 'history', difficulty: 'easy', lang: 'tr' };

function setup() {
  let time = 1_000_000;
  const now = () => time;
  const changes = [];
  const rooms = createRooms({
    now,
    randomBytes,
    loadQuestions: async ({ count }) => QUESTIONS.slice(0, count),
    onChange: (room) => changes.push(room.phase),
  });
  return { rooms, advance: (ms) => { time += ms; rooms.tick(); }, changes };
}

async function roomWith(rooms, settings = {}, players = ['Ayşe', 'Mehmet']) {
  const created = await rooms.create(SELECTION, { count: 5, ...settings }, 'Moderatör');
  const joined = players.map((name) => rooms.join(created.room.code, name));
  return { room: created.room, host: created.token, players: joined };
}

test('settings fall back to defaults and "no limit" forces manual advance', () => {
  assert.deepEqual(normalizeSettings({ count: 7, seconds: 20, extra: 'x' }), normalizeSettings({}));
  assert.equal(normalizeSettings({}).advance, 'manual');
  const unlimited = normalizeSettings({ seconds: 0, advance: 'auto' });
  assert.equal(unlimited.seconds, 0);
  assert.equal(unlimited.advance, 'manual');
  assert.equal(normalizeSettings({ lateJoin: 'yes' }).lateJoin, false);
});

test('nicknames are trimmed, limited and checked', () => {
  assert.equal(cleanName('  Ayşe   Nur '), 'Ayşe Nur');
  assert.equal(cleanName("O'Neil-2"), "O'Neil-2");
  assert.equal(cleanName('a\nb'), 'a b'); // satır sonu boşluğa döner
  for (const bad of ['', '   ', 'x'.repeat(21), '<b>hi</b>', 'a\u0000b', 42, null]) assert.equal(cleanName(bad), null, String(bad));
});

test('a room gets a 6-digit code; the host plays too by default', async () => {
  const { rooms } = setup();
  const { room } = await roomWith(rooms, {}, []);
  assert.match(room.code, /^\d{6}$/);
  assert.equal(room.players.size, 1);
  assert.equal(room.questions.length, 3); // istenen 5, bankada 3 var
  const watching = await rooms.create(SELECTION, { hostPlays: false });
  assert.equal(watching.room.players.size, 0);
  assert.deepEqual(await rooms.create(SELECTION, { hostPlays: true }, '  '), { error: 'bad_name' });
});

test('joining: unique names, a full room, and no late joining unless allowed', async () => {
  const { rooms } = setup();
  const { room, host } = await roomWith(rooms);
  assert.equal(rooms.join(room.code, 'ayşe').error, 'name_taken');
  assert.equal(rooms.join('000000', 'Ali').error, 'not_found');
  rooms.command(room.code, host, 'start');
  assert.equal(rooms.join(room.code, 'Ali').error, 'started');

  const late = await roomWith(rooms, { lateJoin: true });
  rooms.command(late.room.code, late.host, 'start');
  assert.ok(rooms.join(late.room.code, 'Ali').player);

  const big = await roomWith(rooms, {}, []);
  for (let i = 1; i < MAX_PLAYERS; i++) rooms.join(big.room.code, `Oyuncu ${i}`);
  assert.equal(rooms.join(big.room.code, 'Fazla').error, 'full');
});

test('answers before the reveal never reach players; the reveal follows the settings', async () => {
  const { rooms } = setup();
  const { room, host, players } = await roomWith(rooms, { revealOnPhones: false });
  rooms.command(room.code, host, 'start');
  const [ayse] = players;
  const during = rooms.view(room, 'player', ayse.player);
  assert.equal(during.question.prompt, 'Soru 1');
  assert.equal(during.question.answer, undefined);
  assert.equal(during.question.explain, undefined);
  assert.equal(during.question.counts, undefined);

  rooms.command(room.code, host, 'reveal');
  const after = rooms.view(room, 'player', ayse.player);
  assert.equal(after.question.answer, undefined); // telefonlarda cevap gizli seçildi
  assert.deepEqual(after.question.counts, [0, 0, 0, 0]);
  assert.equal(rooms.view(room, 'host', null).question.answer, 1);
});

test('phones can show only the answer buttons (classroom mode)', async () => {
  const { rooms } = setup();
  const { room, host, players } = await roomWith(rooms, { questionOnPhones: false });
  rooms.command(room.code, host, 'start');
  const view = rooms.view(room, 'player', players[0].player);
  assert.equal(view.question.prompt, undefined);
  assert.equal(view.question.options, undefined);
  assert.equal(view.question.optionCount, 4);
  assert.equal(rooms.view(room, 'host', null).question.prompt, 'Soru 1');
});

test('faster correct answers score more; wrong and missing answers score nothing', async () => {
  const { rooms, advance } = setup();
  const { room, host, players } = await roomWith(rooms, { seconds: 20 });
  const hostPlayer = rooms.find(room.code, host).player;
  rooms.command(room.code, host, 'start');
  rooms.answer(room.code, players[0].token, 1); // hemen, doğru
  advance(10_000);
  rooms.answer(room.code, players[1].token, 1); // yarı sürede, doğru
  assert.equal(room.phase, 'question'); // moderatör henüz cevaplamadı
  rooms.answer(room.code, host, 0); // yanlış
  assert.equal(room.phase, 'reveal'); // herkes cevapladı
  assert.equal(players[0].player.score, 1000);
  assert.equal(players[1].player.score, 750);
  assert.equal(hostPlayer.score, 0);
  assert.deepEqual(rooms.view(room, 'player', players[1].player).you.last, { answered: true, correct: true, points: 750 });
});

test('without the speed bonus every correct answer is worth the same', async () => {
  const { rooms, advance } = setup();
  const { room, host, players } = await roomWith(rooms, { speedBonus: false, hostPlays: false });
  rooms.command(room.code, host, 'start');
  rooms.answer(room.code, players[0].token, 1);
  advance(15_000);
  rooms.answer(room.code, players[1].token, 1);
  assert.equal(players[0].player.score, players[1].player.score);
});

test('one answer per question, only while it is open, only valid options', async () => {
  const { rooms, advance } = setup();
  const { room, host, players } = await roomWith(rooms, { seconds: 10 });
  const token = players[0].token;
  assert.equal(rooms.answer(room.code, token, 1).error, 'closed'); // lobi
  rooms.command(room.code, host, 'start');
  assert.equal(rooms.answer(room.code, token, 4).error, 'bad_request');
  assert.equal(rooms.answer(room.code, token, '1').error, 'bad_request');
  assert.ok(rooms.answer(room.code, token, 2).ok);
  assert.equal(rooms.answer(room.code, token, 1).error, 'already_answered');
  assert.equal(rooms.answer(room.code, 'fake-token', 1).error, 'not_found');
  advance(10_001);
  assert.equal(room.phase, 'reveal'); // süre bitti
  assert.equal(rooms.answer(room.code, players[1].token, 1).error, 'closed');
});

test('manual advance waits for the host; the leaderboard comes between questions', async () => {
  const { rooms, advance } = setup();
  const { room, host, players } = await roomWith(rooms, { seconds: 10 });
  rooms.command(room.code, host, 'start');
  advance(11_000);
  assert.equal(room.phase, 'reveal');
  advance(60_000);
  assert.equal(room.phase, 'reveal'); // kendiliğinden geçmez
  assert.equal(rooms.command(room.code, players[0].token, 'next').error, 'forbidden');
  rooms.command(room.code, host, 'next');
  assert.equal(room.phase, 'leaderboard');
  assert.ok(rooms.view(room, 'player', players[0].player).ranking.length === 3);
  rooms.command(room.code, host, 'next');
  assert.equal(room.phase, 'question');
  assert.equal(room.index, 1);
});

test('automatic advance moves on by itself and ends after the last question', async () => {
  const { rooms, advance } = setup();
  const { room, host } = await roomWith(rooms, { seconds: 10, advance: 'auto', leaderboardEach: false });
  rooms.command(room.code, host, 'start');
  for (let i = 0; i < 3; i++) {
    advance(10_001);
    assert.equal(room.phase, 'reveal');
    advance(6_001);
  }
  assert.equal(room.phase, 'final');
});

test('without a time limit the host reveals the answer', async () => {
  const { rooms, advance } = setup();
  const { room, host } = await roomWith(rooms, { seconds: 0 });
  rooms.command(room.code, host, 'start');
  advance(10 * 60_000);
  assert.equal(room.phase, 'question');
  assert.equal(rooms.view(room, 'host', null).question.remainingMs, null);
  rooms.command(room.code, host, 'reveal');
  assert.equal(room.phase, 'reveal');
});

test('pausing freezes the timer and keeps the speed bonus fair', async () => {
  const { rooms, advance } = setup();
  const { room, host, players } = await roomWith(rooms, { seconds: 20, hostPlays: false }, ['Ayşe']);
  rooms.command(room.code, host, 'start');
  advance(5_000);
  rooms.command(room.code, host, 'pause');
  assert.equal(rooms.answer(room.code, players[0].token, 1).error, 'closed');
  advance(60_000); // duraklatmada süre bitmez
  assert.equal(room.phase, 'question');
  assert.equal(rooms.view(room, 'host', null).question.remainingMs, 15_000);
  rooms.command(room.code, host, 'resume');
  rooms.answer(room.code, players[0].token, 1);
  // 20 saniyenin 5'i geçmişti: 500 + 500 × 15/20
  assert.equal(players[0].player.score, 875);
});

test('skipping gives no points; ending and kicking work; the host cannot be kicked', async () => {
  const { rooms } = setup();
  const { room, host, players } = await roomWith(rooms);
  rooms.command(room.code, host, 'start');
  rooms.answer(room.code, players[0].token, 1);
  rooms.command(room.code, host, 'skip');
  assert.equal(room.phase, 'reveal');
  assert.equal(players[0].player.score, 0);
  assert.equal(rooms.view(room, 'host', null).question.skipped, true);

  assert.equal(rooms.command(room.code, host, 'kick', room.host.playerId).error, 'bad_request');
  rooms.command(room.code, host, 'kick', players[1].player.id);
  assert.equal(rooms.answer(room.code, players[1].token, 1).error, 'not_found');
  assert.equal(rooms.view(room, 'host', null).players.length, 2);

  rooms.command(room.code, host, 'end');
  assert.equal(room.phase, 'final');
  assert.equal(rooms.join(room.code, 'Yeni').error, 'ended');
});

test('a kicked player who was the last to answer lets the question reveal', async () => {
  const { rooms } = setup();
  const { room, host, players } = await roomWith(rooms, { hostPlays: false });
  rooms.command(room.code, host, 'start');
  rooms.answer(room.code, players[0].token, 1);
  rooms.command(room.code, host, 'kick', players[1].player.id);
  assert.equal(room.phase, 'reveal');
});

test('idle rooms are removed after 30 minutes', async () => {
  const { rooms, advance } = setup();
  const { room } = await roomWith(rooms);
  advance(IDLE_MS + 1);
  assert.equal(rooms.rooms.has(room.code), false);
});

test('a room without questions is not created', async () => {
  const rooms = createRooms({ now: Date.now, randomBytes, loadQuestions: async () => [] });
  assert.deepEqual(await rooms.create(SELECTION, {}, 'Ali'), { error: 'no_questions' });
});
