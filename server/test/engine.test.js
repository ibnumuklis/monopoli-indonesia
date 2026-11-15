import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, SYSTEM, TILES, rentFor, netWorth, publicState, pendingActors } from '../../shared/src/index.js';

// RNG yang menghasilkan nilai dadu tertentu secara berurutan
const diceRng = (...vals) => { const q = [...vals]; return () => ((q.length ? q.shift() : 3) - 1) / 6 + 0.01; };
const players = (n = 2) => ['A', 'B', 'C', 'D'].slice(0, n).map((id) => ({ id, name: `Pemain ${id}` }));
const newGame = (n = 2, extra = {}) => createGame({ id: 't', keepOrder: true, ...extra }, players(n), () => 0.5);
const act = (g, who, a, rng) => { const r = applyAction(g, who, a, rng); return r; };
const must = (g, who, a, rng) => { const r = applyAction(g, who, a, rng); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };

test('papan memiliki 40 petak lengkap dan 28 aset yang bisa dibeli', () => {
  assert.equal(TILES.length, 40);
  assert.equal(TILES.filter((t) => ['property', 'transport', 'utility'].includes(t.type)).length, 28);
  assert.equal(TILES.filter((t) => t.type === 'property').length, 22);
  for (const t of TILES.filter((x) => x.type === 'property')) {
    assert.equal(t.rent.length, 6, t.name);
    assert.ok(t.rent.every((v, k) => k === 0 || v > t.rent[k - 1]), `sewa naik bertahap: ${t.name}`);
  }
  const g = newGame(4);
  assert.equal(g.players[0].cash, 15_000_000);
});

test('lempar dadu, bergerak, membeli properti, lawan membayar sewa', () => {
  const g = newGame();
  must(g, 'A', { type: 'roll' }, diceRng(1, 2)); // ke petak 3 (Ambon)
  assert.equal(g.players[0].pos, 3);
  assert.equal(g.phase, 'buy');
  must(g, 'A', { type: 'buy' });
  assert.equal(g.props[3].owner, 'A');
  assert.equal(g.players[0].cash, 15_000_000 - 600_000);
  assert.equal(g.phase, 'end');
  must(g, 'A', { type: 'end_turn' });
  assert.equal(g.turn, 1);
  must(g, 'B', { type: 'roll' }, diceRng(2, 1));
  assert.equal(g.players[1].cash, 15_000_000 - 40_000);
  assert.equal(g.players[0].cash, 15_000_000 - 600_000 + 40_000);
});

test('menolak aksi di luar giliran dan input tidak valid (anti-cheat)', () => {
  const g = newGame();
  assert.equal(act(g, 'B', { type: 'roll' }).ok, false);
  assert.equal(act(g, 'X', { type: 'roll' }).ok, false);
  assert.equal(act(g, 'A', { type: 'buy' }).ok, false);
  assert.equal(act(g, 'A', { type: 'end_turn' }).ok, false);
  assert.equal(act(g, 'A', { type: 'hack_cash', amount: 1e12 }).ok, false);
  assert.equal(act(g, 'A', null).ok, false);
  assert.equal(act(g, 'A', { type: 'time_up' }).ok, false, 'aksi sistem tidak boleh dipanggil pemain');
  assert.equal(g.players[0].cash, 15_000_000);
});

test('monopoli menggandakan sewa; bangun merata; hotel; jual bangunan', () => {
  const g = newGame();
  g.props[1].owner = 'A'; g.props[3].owner = 'A';
  assert.equal(rentFor(g, 1, 7), 40_000);
  assert.equal(act(g, 'A', { type: 'build', tile: 1 }).ok, true);
  const second = act(g, 'A', { type: 'build', tile: 1 });
  assert.equal(second.ok, false, 'harus merata');
  must(g, 'A', { type: 'build', tile: 3 });
  for (let k = 0; k < 4; k++) { must(g, 'A', { type: 'build', tile: 1 }); must(g, 'A', { type: 'build', tile: 3 }); }
  assert.equal(g.props[1].houses, 5);
  assert.equal(rentFor(g, 1, 7), 2_500_000);
  assert.equal(act(g, 'A', { type: 'build', tile: 1 }).ok, false);
  must(g, 'A', { type: 'sell_building', tile: 1 });
  assert.equal(g.props[1].houses, 4);
  assert.equal(act(g, 'A', { type: 'mortgage', tile: 1 }).ok, false, 'tidak boleh gadai bila ada bangunan');
  assert.equal(act(g, 'B', { type: 'build', tile: 1 }).ok, false);
});

test('gadai & tebus; properti tergadai tidak memungut sewa', () => {
  const g = newGame();
  g.props[39].owner = 'A';
  must(g, 'A', { type: 'mortgage', tile: 39 });
  assert.equal(g.players[0].cash, 15_000_000 + 2_000_000);
  assert.equal(rentFor(g, 39, 7), 0);
  must(g, 'A', { type: 'unmortgage', tile: 39 });
  assert.equal(g.players[0].cash, 15_000_000 + 2_000_000 - 2_200_000);
});

test('transportasi & utilitas', () => {
  const g = newGame();
  g.props[5].owner = 'A'; g.props[15].owner = 'A';
  assert.equal(rentFor(g, 5, 7), 500_000);
  g.props[12].owner = 'A';
  assert.equal(rentFor(g, 12, 7), 7 * 40_000);
  g.props[28].owner = 'A';
  assert.equal(rentFor(g, 12, 7), 7 * 100_000);
});

test('melewati START memberi gaji', () => {
  const g = newGame();
  g.players[0].pos = 38;
  must(g, 'A', { type: 'roll' }, diceRng(1, 3)); // 38+4 = 2 (Dana Umum)
  assert.ok(g.players[0].stats.passedStart === 1);
});

test('petak Masuk Penjara, bayar denda, dan dadu kembar 3x', () => {
  const g = newGame();
  g.players[0].pos = 25;
  must(g, 'A', { type: 'roll' }, diceRng(2, 3)); // 30 → penjara
  assert.equal(g.players[0].inJail, true);
  assert.equal(g.players[0].pos, 10);
  assert.equal(g.phase, 'end');
  must(g, 'A', { type: 'end_turn' });
  must(g, 'B', { type: 'roll' }, diceRng(1, 2));
  if (g.phase === 'buy') must(g, 'B', { type: 'decline' });
  while (g.phase === 'auction') { must(g, 'A', { type: 'pass_auction' }); if (g.phase === 'auction') must(g, 'B', { type: 'pass_auction' }); }
  must(g, 'B', { type: 'end_turn' });
  must(g, 'A', { type: 'pay_jail' });
  assert.equal(g.players[0].inJail, false);
  assert.equal(g.players[0].cash, 15_000_000 - 500_000);

  const h = newGame();
  must(h, 'A', { type: 'roll' }, diceRng(1, 1)); // 2 Dana Umum (dek dikocok, efek bisa beragam)
  if (h.phase !== 'roll') return; // kartu bisa memindahkan pemain ke penjara; lewati sisa skenario
  h.players[0].pos = 0; h.phase = 'roll';
  must(h, 'A', { type: 'roll' }, diceRng(5, 5));
  if (h.phase === 'buy') must(h, 'A', { type: 'buy' });
  if (h.phase !== 'roll') return;
  must(h, 'A', { type: 'roll' }, diceRng(6, 6));
  assert.equal(h.players[0].inJail, true, 'dadu kembar ketiga → penjara');
});

test('gagal 3x di penjara → wajib denda lalu bergerak', () => {
  const g = newGame();
  const A = g.players[0];
  A.inJail = true; A.pos = 10; A.jailTurns = 2;
  must(g, 'A', { type: 'roll' }, diceRng(1, 3));
  assert.equal(A.inJail, false);
  assert.equal(A.pos, 14);
  assert.equal(A.cash, 15_000_000 - 500_000);
});

test('lelang setelah menolak membeli', () => {
  const g = newGame(3);
  must(g, 'A', { type: 'roll' }, diceRng(1, 2));
  must(g, 'A', { type: 'decline' });
  assert.equal(g.phase, 'auction');
  assert.equal(act(g, 'B', { type: 'bid', amount: 99_999_999 }).ok, false, 'tawaran melebihi kas');
  assert.equal(act(g, 'B', { type: 'bid', amount: 12_345 }).ok, false, 'harus kelipatan 10rb');
  must(g, 'B', { type: 'bid', amount: 300_000 });
  must(g, 'C', { type: 'bid', amount: 350_000 });
  must(g, 'A', { type: 'pass_auction' });
  must(g, 'B', { type: 'pass_auction' });
  assert.equal(g.props[3].owner, 'C');
  assert.equal(g.players[2].cash, 15_000_000 - 350_000);
  assert.equal(g.phase, 'end');
});

test('utang: gadai untuk membayar, lalu bangkrut & pemenang ditentukan', () => {
  const g = newGame();
  g.props[39].owner = 'B'; g.props[37].owner = 'B';
  for (const i of [37, 39]) g.props[i].houses = 5;
  const A = g.players[0];
  A.cash = 100_000; g.props[1].owner = 'A'; g.props[3].owner = 'A';
  A.pos = 36;
  must(g, 'A', { type: 'roll' }, diceRng(1, 2)); // 39 Jakarta hotel = 20jt → tidak mampu
  assert.equal(A.bankrupt, true);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 'B');
  assert.equal(g.props[1].owner, 'B', 'aset diserahkan ke kreditor');

  const h = newGame();
  h.props[19].owner = 'B'; h.props[16].owner = 'B'; h.props[18].owner = 'B';
  h.props[19].houses = 3; h.props[16].houses = 3; h.props[18].houses = 3; // sewa Makassar 3 rumah = 6jt
  const A2 = h.players[0];
  A2.cash = 1_000_000; h.props[39].owner = 'A'; h.props[37].owner = 'A'; h.props[34].owner = 'A'; A2.pos = 16;
  must(h, 'A', { type: 'roll' }, diceRng(1, 2));
  assert.equal(h.phase, 'debt');
  assert.equal(act(h, 'A', { type: 'pay_debt' }).ok, false);
  assert.equal(act(h, 'B', { type: 'roll' }).ok, false, 'B tidak bisa melempar saat A berutang');
  must(h, 'A', { type: 'mortgage', tile: 39 });
  must(h, 'A', { type: 'mortgage', tile: 37 });
  assert.equal(act(h, 'A', { type: 'pay_debt' }).ok, false, 'masih kurang');
  must(h, 'A', { type: 'mortgage', tile: 34 });
  must(h, 'A', { type: 'pay_debt' });
  assert.equal(h.phase, 'end');
  assert.equal(A2.cash, 1_000_000 + 2_000_000 + 1_750_000 + 1_600_000 - 6_000_000);
  assert.equal(h.players[1].cash, 15_000_000 + 6_000_000);
});

test('dagang antarpemain: valid, ditolak bila ada bangunan', () => {
  const g = newGame();
  g.props[5].owner = 'A'; g.props[39].owner = 'B';
  must(g, 'A', { type: 'propose_trade', to: 'B', offer: { cash: 1_000_000, tiles: [5] }, request: { tiles: [39] } });
  const tr = g.trades[0];
  assert.equal(act(g, 'A', { type: 'respond_trade', id: tr.id, accept: true }).ok, false, 'pengaju tidak boleh menerima sendiri');
  must(g, 'B', { type: 'respond_trade', id: tr.id, accept: true });
  assert.equal(g.props[5].owner, 'B');
  assert.equal(g.props[39].owner, 'A');
  assert.equal(g.players[1].cash, 16_000_000);
  g.props[1].owner = 'A'; g.props[3].owner = 'A'; g.props[1].houses = 1;
  assert.equal(act(g, 'A', { type: 'propose_trade', to: 'B', offer: { tiles: [3] }, request: { cash: 1 } }).ok, false);
  assert.equal(act(g, 'A', { type: 'propose_trade', to: 'B', offer: { tiles: [15] }, request: {} }).ok, false, 'bukan milik A');
});

test('akhir permainan lewat voting & batas waktu', () => {
  const g = newGame(3);
  g.props[39].owner = 'C';
  must(g, 'A', { type: 'vote_end' });
  must(g, 'B', { type: 'vote_end' });
  assert.equal(g.status, 'playing');
  must(g, 'C', { type: 'vote_end' });
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 'C');
  assert.equal(g.ranking.length, 3);
  const h = newGame();
  must(h, SYSTEM, { type: 'time_up' });
  assert.equal(h.status, 'finished');
});

test('mode tim: bebas sewa untuk rekan setim, tim lawan bangkrut → tim menang', () => {
  const ps = [{ id: 'A', name: 'A', team: 'Merah' }, { id: 'B', name: 'B', team: 'Biru' }, { id: 'C', name: 'C', team: 'Merah' }, { id: 'D', name: 'D', team: 'Biru' }];
  const g = createGame({ keepOrder: true, mode: 'team' }, ps, () => 0.5);
  g.props[3].owner = 'C';
  must(g, 'A', { type: 'roll' }, diceRng(1, 2));
  assert.equal(g.players[0].cash, 15_000_000);
  must(g, 'A', { type: 'end_turn' });
  must(g, 'B', { type: 'bankrupt' });
  assert.equal(g.status, 'playing');
  must(g, 'C', { type: 'roll' }, diceRng(1, 3));
  if (g.phase === 'buy') must(g, 'C', { type: 'decline' });
  while (g.phase === 'auction') must(g, pendingActors(g)[0], { type: 'pass_auction' });
  must(g, 'D', { type: 'bankrupt' });
  assert.equal(g.status, 'finished');
  assert.equal(g.winnerTeam, 'Merah');
});

test('state publik tidak membocorkan urutan dek kartu', () => {
  const g = newGame();
  const s = publicState(g);
  assert.equal(s.decks, undefined);
  assert.ok(s.deckSizes.chance === 16);
  assert.ok(netWorth(g, 'A') === 15_000_000);
});
