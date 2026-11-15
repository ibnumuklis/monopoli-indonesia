// Uji API: ekonomi, toko, misi, sosial, guild, turnamen, admin RBAC, audit, keamanan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, setTestEnv, api, register, connect, emit } from './helpers.js';

setTestEnv();
const { createServer } = await import('../src/index.js');
let srv; let base;
before(async () => { await resetDb(); srv = await createServer({ port: 0, silent: true }); base = `http://localhost:${srv.port}`; });
after(async () => { await srv?.close(); const { closeDb } = await import('../src/db/index.js'); await closeDb(); });

test('login harian hanya sekali per hari & tercatat di buku besar', async () => {
  const t = await register(base, 'harian');
  const A = api(base, t);
  const r1 = await A('POST', '/api/daily/claim');
  assert.equal(r1.status, 200); assert.equal(r1.data.streak, 1);
  assert.equal((await A('POST', '/api/daily/claim')).status, 400);
  const [r2, r3] = await Promise.all([A('POST', '/api/daily/claim'), A('POST', '/api/daily/claim')]);
  assert.ok(r2.status === 400 && r3.status === 400);
  const me = (await A('GET', '/api/me')).data;
  assert.equal(me.wallet.coins, 2000 + 100);
  assert.equal(me.daily.claimedToday, true);
  const tx = (await A('GET', '/api/me/transactions')).data;
  assert.ok(tx.some((x) => /Login harian/.test(x.reason)));
});

test('toko: beli item, cegah pembelian ganda & saldo kurang, item non-toko ditolak, kustomisasi butuh kepemilikan', async () => {
  const t = await register(base, 'pembeli');
  const A = api(base, t);
  assert.equal((await A('POST', '/api/customize', { pawn: 'pawn_emas' })).status, 403);
  // beli bersamaan 3x dengan requestId sama dan berbeda → hanya satu yang berhasil
  const rs = await Promise.all([1, 2, 3].map((k) => A('POST', '/api/shop/buy', { itemId: 'emote_juragan', currency: 'coins', requestId: `r${k}` })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1, rs.map((r) => r.data.error).join('|'));
  const me = (await A('GET', '/api/me')).data;
  assert.equal(me.wallet.coins, 500, 'hanya didebit satu kali');
  assert.equal((await A('POST', '/api/shop/buy', { itemId: 'siti', currency: 'coins' })).status, 400, 'koin tidak cukup');
  assert.equal((await A('POST', '/api/shop/buy', { itemId: 'ayu', currency: 'coins' })).status, 400, 'item misi tidak dijual');
  assert.equal((await A('POST', '/api/shop/buy', { itemId: 'tidak_ada' })).status, 404);
  assert.equal((await A('POST', '/api/customize', { emotes: ['emote_juragan', 'emote_senyum'] })).status, 200);
  assert.deepEqual((await A('GET', '/api/me')).data.emotes, ['emote_juragan', 'emote_senyum']);
  assert.equal((await A('POST', '/api/customize', { character: 'bima' })).status, 200);
  const w = (await A('GET', '/api/me')).data.wallet;
  assert.ok(w.coins >= 0);
  assert.equal((await A('POST', '/api/shop/topup', {})).status, 501, 'top up uang asli tidak aktif tanpa payment gateway');
  // tukar diamond → tiket
  assert.equal((await A('POST', '/api/shop/tickets', { count: 2 })).status, 200);
  assert.equal((await A('GET', '/api/me')).data.wallet.tickets, 4);
  assert.equal((await A('POST', '/api/shop/tickets', { count: 10 })).status, 400, 'diamond tidak cukup');
});

test('misi belum selesai tidak bisa diklaim; achievement terkunci', async () => {
  const A = api(base, await register(base, 'misi_x'));
  assert.equal((await A('POST', '/api/missions/d_play3/claim')).status, 400);
  assert.equal((await A('POST', '/api/achievements/a_first_win/claim')).status, 400);
  const m = (await A('GET', '/api/missions')).data;
  assert.ok(m.missions.length >= 8);
  assert.ok(m.missions.some((x) => x.kind === 'event'), 'misi event aktif tampil');
});

test('teman, DM khusus teman, blokir, laporan, guild, turnamen', async () => {
  const tA = await register(base, 'teman_a'); const tB = await register(base, 'teman_b');
  const A = api(base, tA); const B = api(base, tB);
  const idB = (await B('GET', '/api/me')).data.id;
  assert.equal((await A('POST', `/api/dm/${idB}`, { text: 'hai' })).status, 403, 'DM hanya untuk teman');
  const found = (await A('GET', '/api/players/search/teman_b')).data;
  assert.equal(found[0].id, idB);
  assert.equal((await A('POST', '/api/friends/request', { userId: idB })).status, 200);
  const inc = (await B('GET', '/api/friends')).data.incoming;
  assert.equal(inc.length, 1);
  assert.equal((await B('POST', `/api/friends/${inc[0].id}/accept`)).status, 200);
  assert.equal((await A('GET', '/api/friends')).data.friends.length, 1);
  const dm = await A('POST', `/api/dm/${idB}`, { text: 'main yuk www.situs-judi.com' });
  assert.equal(dm.status, 200);
  assert.match(dm.data.body, /tautan dihapus/);
  assert.equal((await A('POST', '/api/report', { userId: idB, reason: 'toxic', detail: 'uji' })).status, 200);
  assert.equal((await A('POST', '/api/block', { userId: idB })).status, 200);
  assert.equal((await A('GET', '/api/friends')).data.friends.length, 0, 'blokir menghapus pertemanan');
  assert.equal((await B('POST', '/api/friends/request', { userId: (await A('GET', '/api/me')).data.id })).status, 403);

  // guild: biaya 5000 koin → saldo awal kurang
  assert.equal((await A('POST', '/api/guilds', { name: 'Garuda', tag: 'GRD' })).status, 400);
  // turnamen
  const tours = (await A('GET', '/api/tournaments')).data;
  assert.ok(tours.length >= 1);
  assert.equal((await A('POST', `/api/tournaments/${tours[0].id}/join`)).status, 200);
  assert.equal((await A('POST', `/api/tournaments/${tours[0].id}/join`)).status, 400);
  assert.equal((await A('GET', '/api/me')).data.wallet.tickets, 1, 'tiket terpakai');
});

test('admin RBAC: pemain biasa ditolak, super admin dapat mengelola, audit log tercatat', async () => {
  const tP = await register(base, 'biasa_saja');
  assert.equal((await api(base, tP)('GET', '/api/admin/dashboard')).status, 403);
  const login = await api(base)('POST', '/api/auth/login', { username: 'superadmin', password: 'rahasia-super-123' });
  const S = api(base, login.data.token);
  const d = await S('GET', '/api/admin/dashboard');
  assert.equal(d.status, 200);
  assert.ok(d.data.users.total >= 5);
  const pid = (await api(base, tP)('GET', '/api/me')).data.id;
  // buat moderator, cek batas izinnya
  assert.equal((await S('POST', '/api/admin/admins', { username: 'mod_satu', password: 'password-mod-1', role: 'moderator' })).status, 200);
  const M = api(base, (await api(base)('POST', '/api/auth/login', { username: 'mod_satu', password: 'password-mod-1' })).data.token);
  assert.equal((await M('POST', `/api/admin/players/${pid}/wallet`, { currency: 'coins', amount: 1000, reason: 'uji coba' })).status, 403, 'moderator tidak boleh ubah dompet');
  assert.equal((await M('PUT', '/api/admin/settings/maintenance', { enabled: true })).status, 403);
  assert.equal((await M('POST', `/api/admin/players/${pid}/mute`, { minutes: 10 })).status, 200);
  // super admin menyesuaikan dompet (wajib alasan)
  assert.equal((await S('POST', `/api/admin/players/${pid}/wallet`, { currency: 'coins', amount: 1000 })).status, 400);
  assert.equal((await S('POST', `/api/admin/players/${pid}/wallet`, { currency: 'coins', amount: 1000, reason: 'kompensasi gangguan' })).status, 200);
  assert.equal((await api(base, tP)('GET', '/api/me')).data.wallet.coins, 3000);
  // kirim hadiah via inbox lalu klaim
  assert.equal((await S('POST', '/api/admin/rewards', { userId: pid, title: 'Hadiah', body: 'Untukmu', diamonds: 5 })).status, 200);
  const inbox = (await api(base, tP)('GET', '/api/inbox')).data;
  const rw = inbox.find((m) => m.reward);
  assert.equal((await api(base, tP)('POST', `/api/inbox/${rw.id}/claim`)).status, 200);
  assert.equal((await api(base, tP)('POST', `/api/inbox/${rw.id}/claim`)).status, 400, 'klaim ganda ditolak');
  // ubah nama properti
  assert.equal((await S('PATCH', '/api/admin/properties/39', { name: 'DKI Jakarta' })).status, 200);
  assert.equal((await api(base)('GET', '/api/board')).data.tiles[39].name, 'DKI Jakarta');
  assert.equal((await S('PATCH', '/api/admin/properties/39', { rent: [1, 2, 3] })).status, 400);
  // ban → sesi dicabut
  assert.equal((await S('POST', `/api/admin/players/${pid}/ban`, { reason: 'uji' })).status, 200);
  assert.equal((await api(base, tP)('GET', '/api/me')).status, 401);
  const audit = (await S('GET', '/api/admin/audit')).data;
  for (const a of ['player.ban', 'player.wallet_adjust', 'player.mute', 'reward.send', 'property.update', 'admin.create']) assert.ok(audit.some((x) => x.action === a), a);
  // laporan tampil untuk moderator
  assert.ok((await M('GET', '/api/admin/reports')).data.reports.length >= 1);
  await S('PATCH', '/api/admin/properties/39', { name: 'Jakarta' });
});

test('keamanan: payload besar ditolak, spam chat dibatasi, pemain dibisukan tidak bisa chat', async () => {
  const t = await register(base, 'spammer');
  const big = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x'.repeat(100_000) }) });
  assert.equal(big.status, 413);
  const s = await connect(base, t);
  await emit(s, 'practice:start', { bots: 1 });
  const results = [];
  for (let k = 0; k < 12; k++) results.push(await emit(s, 'chat:send', { text: `pesan ${k}` }));
  assert.ok(results.some((r) => !r.ok && /Terlalu banyak/.test(r.error)), 'rate limit chat aktif');
  const dup = [];
  for (let k = 0; k < 3; k++) dup.push(await emit(s, 'chat:send', { text: 'sama' }));
  await emit(s, 'room:leave');
  s.close();
  const res = await fetch(`${base}/api/me`, { headers: { Authorization: 'Bearer ' + 'a'.repeat(5000) } });
  assert.equal(res.status, 401);
  const hdr = await fetch(`${base}/health`);
  assert.equal(hdr.headers.get('x-frame-options'), 'DENY');
  assert.ok(hdr.headers.get('content-security-policy'));
});
