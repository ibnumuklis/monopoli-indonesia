// Uji integrasi multiplayer end-to-end: 4 klien terpisah bermain di server sungguhan + PostgreSQL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, setTestEnv, api, register, connect, emit, sleep, waitFor } from './helpers.js';

setTestEnv();
const { chooseBotAction } = await import('../../shared/src/index.js');
const { createServer } = await import('../src/index.js');

let srv; let base;
before(async () => { await resetDb(); srv = await createServer({ port: 0, silent: true }); base = `http://localhost:${srv.port}`; });
after(async () => { await srv?.close(); const { closeDb } = await import('../src/db/index.js'); await closeDb(); });

/** Autopilot: klien memainkan gilirannya sendiri memakai logika bot — tetapi lewat jaringan seperti pemain sungguhan. */
function autopilot(sock, me, { stopAfterRound = 0, onAct } = {}) {
  let busy = false; let cid = 0; let voted = false;
  const tick = async () => {
    const st = sock.state;
    if (busy || !st?.game || st.game.status !== 'playing') return;
    const g = st.game;
    if (stopAfterRound && g.round >= stopAfterRound && !voted) {
      voted = true; busy = true;
      await emit(sock, 'game:action', { action: { type: 'vote_end' }, cid: `${me}-vote` });
      busy = false; return;
    }
    const a = chooseBotAction(g, me, 'normal');
    if (!a) return;
    busy = true;
    const r = await emit(sock, 'game:action', { action: a, cid: `${me}-${++cid}` });
    onAct?.(a, r);
    busy = false;
  };
  const iv = setInterval(tick, 5);
  return () => clearInterval(iv);
}

test('autentikasi: register, login, tamu, token salah, socket tanpa token ditolak', async () => {
  const a = api(base);
  assert.equal((await a('POST', '/api/auth/register', { username: 'ab', password: 'password123' })).status, 400);
  assert.equal((await a('POST', '/api/auth/register', { username: 'pemain_satu', password: 'pendek' })).status, 400);
  const t = await register(base, 'pemain_satu');
  assert.equal((await a('POST', '/api/auth/register', { username: 'PEMAIN_SATU', password: 'password123' })).status, 409, 'username unik case-insensitive');
  assert.equal((await a('POST', '/api/auth/login', { username: 'pemain_satu', password: 'salah-password' })).status, 401);
  assert.equal((await a('POST', '/api/auth/login', { username: 'pemain_satu', password: 'password123' })).status, 200);
  const me = await api(base, t)('GET', '/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.wallet.coins, 2000);
  assert.equal((await api(base, 'token-palsu')('GET', '/api/me')).status, 401);
  const g = await a('POST', '/api/auth/guest', { name: 'Tamu Hebat' });
  assert.equal(g.status, 200);
  await assert.rejects(connect(base, 'token-palsu'));
});

test('4 pemain dari klien berbeda: buat room, gabung, siap, mulai, bermain sinkron hingga selesai', async () => {
  const names = ['ibnu', 'ulfa', 'andi', 'dilla'];
  const tokens = await Promise.all(names.map((n) => register(base, n)));
  const socks = await Promise.all(tokens.map((t) => connect(base, t)));
  const ids = await Promise.all(tokens.map(async (t) => (await api(base, t)('GET', '/api/me')).data.id));

  const c = await emit(socks[0], 'room:create', { name: 'Room Uji', mode: 'classic', isPrivate: true, turnSeconds: 30 });
  assert.ok(c.ok, c.error);
  assert.match(c.code, /^\d{6}$/);
  // room privat tidak muncul di daftar publik
  assert.equal((await emit(socks[1], 'room:list')).rooms.some((r) => r.code === c.code), false);
  assert.equal((await emit(socks[1], 'room:join', { code: '000000' })).ok, false);
  for (const s of socks.slice(1)) assert.ok((await emit(s, 'room:join', { code: c.code })).ok);
  const fifth = await connect(base, await register(base, 'kelima'));
  const full = await emit(fifth, 'room:join', { code: c.code });
  assert.equal(full.ok, false); assert.match(full.error, /penuh/);
  fifth.close();

  // host tidak bisa mulai sebelum semua siap; non-host tidak bisa mulai
  assert.equal((await emit(socks[0], 'room:start')).ok, false);
  assert.equal((await emit(socks[1], 'room:start')).ok, false);
  for (const s of socks.slice(1)) assert.ok((await emit(s, 'room:ready', { ready: true })).ok);
  assert.ok((await emit(socks[0], 'room:start')).ok);
  await waitFor(() => socks.every((s) => s.state?.game?.status === 'playing'), 5000, 'semua klien menerima state');

  // anti-cheat: aksi di luar giliran / aksi sistem / payload aneh ditolak
  const g0 = socks[0].state.game;
  const notCur = socks.find((s, i) => ids[i] !== g0.players[g0.turn].id);
  assert.equal((await emit(notCur, 'game:action', { action: { type: 'roll' } })).ok, false);
  assert.equal((await emit(socks[0], 'game:action', { action: { type: 'time_up' } })).ok, false);
  assert.equal((await emit(socks[0], 'game:action', { action: 'hapus-semua' })).ok, false);

  // idempotensi: cid yang sama dikirim dua kali → hanya satu lemparan dadu
  const cur = socks[ids.indexOf(g0.players[g0.turn].id)];
  const rolls0 = g0.diceHistory.length;
  const [r1, r2] = await Promise.all([emit(cur, 'game:action', { action: { type: 'roll' }, cid: 'dup-1' }), emit(cur, 'game:action', { action: { type: 'roll' }, cid: 'dup-1' })]);
  assert.ok(r1.ok && r2.ok);
  await sleep(100);
  assert.equal(cur.state.game.diceHistory.length, rolls0 + 1, 'roll ganda tidak dieksekusi dua kali');

  // chat real-time + sensor kata kasar
  const got = new Promise((res) => socks[3].once('chat:message', res));
  await emit(socks[0], 'chat:send', { text: 'Halo semua, dasar goblok!' });
  const msg = await got;
  assert.match(msg.text, /Halo semua/);
  assert.doesNotMatch(msg.text, /goblok/);

  // Mainkan sampai ronde 12 lalu semua sepakat mengakhiri permainan
  const stops = socks.map((s, i) => autopilot(s, ids[i], { stopAfterRound: 12 }));
  await waitFor(() => socks[0].state?.game?.status === 'finished', 120_000, 'permainan selesai');
  stops.forEach((f) => f());
  const fin = socks.map((s) => s.state.game);
  assert.ok(fin.every((g) => g.seq === fin[0].seq), 'semua klien menerima state akhir yang identik');
  assert.ok(fin.every((g) => g.winner === fin[0].winner));
  if (fin[0].endReason !== 'vote') console.log(fin[0].log.filter((e) => ['bankrupt', 'debt', 'vote', 'win'].includes(e.type)).map((e) => e.text));
  assert.equal(fin[0].endReason, 'vote');
  assert.equal(fin[0].ranking.length, 4);
  await waitFor(() => socks[0].state.room.results, 10_000, 'hasil hadiah');
  const results = socks[0].state.room.results;
  const winnerRes = results[fin[0].winner];
  assert.ok(winnerRes.won && winnerRes.coins > 0 && winnerRes.rp > 0);

  // statistik & hadiah tersimpan di database
  const me = (await api(base, tokens[ids.indexOf(fin[0].winner)])('GET', '/api/me')).data;
  assert.equal(me.gamesPlayed, 1); assert.equal(me.wins, 1);
  assert.ok(me.wallet.coins > 2000);
  const lb = (await api(base, tokens[0])('GET', '/api/leaderboard?period=weekly')).data;
  assert.equal(lb.rows.length, 4);
  const hist = (await api(base, tokens[0])('GET', '/api/me/history')).data;
  assert.equal(hist.length, 1);
  const ms = (await api(base, tokens[0])('GET', '/api/missions')).data;
  assert.ok(ms.missions.find((m) => m.id === 'd_play3').progress >= 1, 'progres misi bertambah');
  for (const s of socks) { await emit(s, 'room:dismiss'); s.close(); }
});

test('2 pemain bermain sampai salah satu bangkrut (permainan penuh)', async () => {
  const tokens = [await register(base, 'raja_satu'), await register(base, 'raja_dua')];
  const socks = await Promise.all(tokens.map((t) => connect(base, t)));
  const ids = await Promise.all(tokens.map(async (t) => (await api(base, t)('GET', '/api/me')).data.id));
  const c = await emit(socks[0], 'room:create', { mode: 'classic', startCash: 10_000_000 });
  await emit(socks[1], 'room:join', { code: c.code });
  await emit(socks[1], 'room:ready', { ready: true });
  assert.ok((await emit(socks[0], 'room:start')).ok);
  await waitFor(() => socks[0].state?.game, 3000);
  const stops = socks.map((s, i) => autopilot(s, ids[i]));
  await waitFor(() => socks[0].state?.game?.status === 'finished', 240_000, 'kebangkrutan');
  stops.forEach((f) => f());
  const g = socks[0].state.game;
  assert.ok(['last', 'rounds'].includes(g.endReason));
  if (g.endReason === 'last') assert.ok(g.players.some((p) => p.bankrupt));
  for (const s of socks) { await emit(s, 'room:dismiss'); s.close(); }
});

test('disconnect → bot mengambil alih setelah grace → reconnect mengembalikan kendali', async () => {
  const tA = await register(base, 'putus_a'); const tB = await register(base, 'putus_b');
  let a = await connect(base, tA); const b = await connect(base, tB);
  const idA = (await api(base, tA)('GET', '/api/me')).data.id;
  const idB = (await api(base, tB)('GET', '/api/me')).data.id;
  const c = await emit(a, 'room:create', { mode: 'classic' });
  await emit(b, 'room:join', { code: c.code });
  await emit(b, 'room:ready', { ready: true });
  await emit(a, 'room:start');
  await waitFor(() => b.state?.game, 3000);
  const stopB = autopilot(b, idB);
  a.close();
  await waitFor(() => b.state?.room?.seats.find((s) => s.userId === idA)?.connected === false, 3000, 'status terputus terlihat oleh lawan');
  // setelah grace (2 dtk) bot memainkan giliran A → permainan tetap berjalan
  const seq0 = b.state.game.seq;
  await waitFor(() => b.state.room.seats.find((s) => s.userId === idA)?.auto && b.state.game.seq > seq0 + 10, 15_000, 'bot mengambil alih');
  // reconnect dengan token yang sama → kembali ke room yang sama dengan state terbaru
  a = await connect(base, tA);
  const sync = await emit(a, 'room:sync');
  assert.equal(sync.code, c.code);
  await waitFor(() => a.state?.room?.seats.find((s) => s.userId === idA)?.connected === true && !a.state.room.seats.find((s) => s.userId === idA).auto, 3000, 'kendali kembali');
  stopB();
  await emit(a, 'room:leave');
  await waitFor(() => b.state.game.status === 'finished', 5000, 'lawan menang karena A keluar');
  assert.equal(b.state.game.winner, idB);
  a.close(); b.close();
});

test('host keluar dari room menunggu → host pindah; matchmaking quick play mempertemukan pemain', async () => {
  const t1 = await register(base, 'host_lama'); const t2 = await register(base, 'host_baru');
  const s1 = await connect(base, t1); const s2 = await connect(base, t2);
  const id2 = (await api(base, t2)('GET', '/api/me')).data.id;
  const c = await emit(s1, 'room:create', { mode: 'classic', isPrivate: false, name: 'Room Publik' });
  assert.ok((await emit(s2, 'room:list')).rooms.some((r) => r.code === c.code), 'room publik terlihat');
  await emit(s2, 'room:join', { code: c.code });
  await emit(s1, 'room:leave');
  await waitFor(() => s2.state?.room?.hostId === id2, 3000, 'host berpindah');
  await emit(s2, 'room:leave');

  const t3 = await register(base, 'antri_tiga');
  const s3 = await connect(base, t3);
  const m2 = new Promise((r) => s2.once('mm:matched', r));
  const m3 = new Promise((r) => s3.once('mm:matched', r));
  assert.ok((await emit(s2, 'mm:join', { mode: 'classic' })).ok);
  assert.ok((await emit(s3, 'mm:join', { mode: 'classic' })).ok);
  const [a, b] = await Promise.all([m2, m3]);
  assert.equal(a.code, b.code, 'dua pemain dipertemukan di room yang sama');
  await waitFor(() => s2.state?.game?.status === 'playing', 8000, 'pertandingan auto-start');
  await emit(s2, 'room:leave'); await emit(s3, 'room:leave');
  s1.close(); s2.close(); s3.close();
});

test('practice mode melawan bot berjalan otomatis; team battle memvalidasi komposisi tim', async () => {
  const t = await register(base, 'latihan_x');
  const s = await connect(base, t);
  const id = (await api(base, t)('GET', '/api/me')).data.id;
  const p = await emit(s, 'practice:start', { bots: 3, level: 'easy' });
  assert.ok(p.ok, p.error);
  await waitFor(() => s.state?.game?.players.length === 4, 3000);
  const stop = autopilot(s, id);
  await waitFor(() => s.state.game.round >= 4, 30_000, 'bot bermain bersama pemain');
  stop();
  await emit(s, 'room:leave');

  const c = await emit(s, 'room:create', { mode: 'team' });
  assert.ok(c.ok);
  await emit(s, 'room:addBot', { level: 'normal' });
  assert.match((await emit(s, 'room:start')).error, /4 pemain/);
  await emit(s, 'room:addBot', {}); await emit(s, 'room:addBot', {});
  const teams = s.state.room.seats.map((x) => x.team);
  assert.equal(teams.filter((x) => x === 'Merah').length, 2);
  assert.ok((await emit(s, 'room:start')).ok);
  await waitFor(() => s.state.game?.mode === 'team', 3000);
  const order = s.state.game.players.map((x) => x.team);
  assert.notEqual(order[0], order[1], 'urutan giliran berselang antartim');
  await emit(s, 'room:leave');
  s.close();
});

test('server restart di tengah permainan → permainan dipulihkan dari database', async () => {
  const tA = await register(base, 'restart_a'); const tB = await register(base, 'restart_b');
  const a = await connect(base, tA); const b = await connect(base, tB);
  const idA = (await api(base, tA)('GET', '/api/me')).data.id; const idB = (await api(base, tB)('GET', '/api/me')).data.id;
  const c = await emit(a, 'room:create', { mode: 'classic' });
  await emit(b, 'room:join', { code: c.code }); await emit(b, 'room:ready', { ready: true }); await emit(a, 'room:start');
  await waitFor(() => a.state?.game, 3000);
  const stops = [autopilot(a, idA), autopilot(b, idB)];
  await waitFor(() => a.state.game.round >= 3, 20_000);
  stops.forEach((f) => f());
  await sleep(800); // tunggu persist
  const before = a.state.game;
  a.close(); b.close();
  await srv.close();
  srv = await createServer({ port: 0, silent: true });
  base = `http://localhost:${srv.port}`;
  const a2 = await connect(base, tA);
  const sync = await emit(a2, 'room:sync');
  assert.equal(sync.code, c.code, 'pemain kembali ke room yang sama');
  await waitFor(() => a2.state?.game, 3000);
  assert.ok(a2.state.game.seq >= before.seq - 5, 'state tidak hilang');
  assert.deepEqual(a2.state.game.players.map((p) => p.id), before.players.map((p) => p.id));
  const b2 = await connect(base, tB);
  const stops2 = [autopilot(a2, idA), autopilot(b2, idB)];
  const r0 = a2.state.game.round;
  await waitFor(() => a2.state.game.round >= r0 + 2, 20_000, 'permainan berlanjut setelah restart');
  stops2.forEach((f) => f());
  await emit(a2, 'room:leave'); await emit(b2, 'room:leave');
  a2.close(); b2.close();
});

test('mode Auto: bot memainkan giliran pemain yang mengaktifkannya; aksi manual mematikannya', async () => {
  const t = await register(base, 'auto_mode');
  const s = await connect(base, t);
  const id = (await api(base, t)('GET', '/api/me')).data.id;
  assert.ok((await emit(s, 'practice:start', { bots: 1, level: 'easy' })).ok);
  await waitFor(() => s.state?.game, 3000);
  assert.ok((await emit(s, 'game:auto', { on: true })).ok);
  await waitFor(() => s.state.room.seats.find((x) => x.userId === id)?.auto, 3000, 'status auto');
  const myTurns = () => s.state.game.log.filter((e) => e.type === 'roll' && e.player === id).length;
  await waitFor(() => myTurns() >= 2, 15_000, 'bot bermain atas nama pemain');
  assert.ok((await emit(s, 'game:auto', { on: false })).ok);
  await waitFor(() => !s.state.room.seats.find((x) => x.userId === id)?.auto, 3000, 'auto mati');
  await emit(s, 'room:leave');
  s.close();
});
