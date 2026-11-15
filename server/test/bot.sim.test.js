import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, chooseBotAction, pendingActors, buildingCounts, TILES, SYSTEM } from '../../shared/src/index.js';

// PRNG deterministik (mulberry32) agar kegagalan bisa direproduksi
function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function invariants(g) {
  for (const p of g.players) {
    assert.ok(p.cash >= 0, `kas negatif ${p.name}: ${p.cash}`);
    assert.ok(Number.isInteger(p.cash), 'kas harus bilangan bulat');
    assert.ok(p.pos >= 0 && p.pos < 40);
    if (p.bankrupt) assert.equal(Object.values(g.props).filter((s) => s.owner === p.id).length, 0);
  }
  const { houses, hotels } = buildingCounts(g);
  assert.ok(houses <= 32 && hotels <= 12, 'stok bangunan');
  for (const [i, s] of Object.entries(g.props)) {
    assert.ok(s.houses >= 0 && s.houses <= 5);
    if (s.houses) assert.equal(TILES[i].type, 'property');
    if (s.mortgaged) assert.equal(s.houses, 0);
  }
  const deckTotal = g.decks.chance.length + g.decks.chest.length + g.decks.budaya.length + g.players.reduce((n, p) => n + p.jailCards.length, 0);
  assert.equal(deckTotal, 16 + 16 + 12, 'jumlah kartu konstan');
}

function runGame(seed, n, mode = 'classic') {
  const rng = mulberry(seed);
  const ps = Array.from({ length: n }, (_, k) => ({ id: `b${k}`, name: `Bot${k}`, isBot: true, team: mode === 'team' ? (k % 2 ? 'Biru' : 'Merah') : null }));
  const g = createGame({ id: `sim${seed}`, mode, settings: { maxRounds: 250 } }, ps, rng);
  const levels = ['easy', 'normal', 'hard', 'normal'];
  let steps = 0;
  while (g.status === 'playing') {
    steps += 1;
    assert.ok(steps < 60_000, `permainan tidak berakhir (seed ${seed})`);
    const actors = pendingActors(g);
    assert.ok(actors.length > 0, `tidak ada aktor (fase ${g.phase}, seed ${seed})`);
    const who = actors[Math.floor(rng() * actors.length)];
    const a = chooseBotAction(g, who, levels[Number(who.slice(1))], rng);
    assert.ok(a, `bot tidak memilih aksi (fase ${g.phase}, seed ${seed})`);
    const r = applyAction(g, who, a, rng);
    if (!r.ok) {
      // aksi bot yang ditolak tidak boleh membuat macet: paksa jalan aman
      const fallback = g.phase === 'auction' ? { type: 'pass_auction' } : g.phase === 'debt' ? { type: 'bankrupt' } : g.phase === 'buy' ? { type: 'decline' } : g.phase === 'end' ? { type: 'end_turn' } : { type: 'roll' };
      const r2 = applyAction(g, who, fallback, rng);
      assert.ok(r2.ok, `fallback gagal: ${a.type} → ${r.error} / ${r2.error} (seed ${seed})`);
    }
    // kadang bot mengajukan dagang (menguji jalur dagang)
    if (g.status === 'playing' && (g.phase === 'end') && rng() < 0.02) {
      const me = g.players[g.turn];
      const other = g.players.find((p) => p.id !== me.id && !p.bankrupt);
      const mine = Object.entries(g.props).find(([, s]) => s.owner === me.id && !s.houses);
      if (other && mine) applyAction(g, me.id, { type: 'propose_trade', to: other.id, offer: { tiles: [Number(mine[0])] }, request: { cash: 500_000 } }, rng);
      const resp = chooseBotAction(g, other?.id);
      if (resp && resp.type === 'respond_trade') applyAction(g, other.id, resp, rng);
    }
    invariants(g);
  }
  assert.ok(g.ranking && g.winner, 'pemenang ditentukan');
  return g;
}

test('300 pertandingan bot (2–4 pemain) selesai tanpa melanggar invarian', () => {
  const reasons = {};
  let rounds = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const g = runGame(seed, 2 + (seed % 3));
    reasons[g.endReason] = (reasons[g.endReason] || 0) + 1;
    rounds += g.round;
  }
  console.log('alasan selesai:', reasons, 'rata-rata ronde:', (rounds / 300).toFixed(1));
  assert.ok((reasons.last || 0) > 150, 'mayoritas permainan berakhir karena kebangkrutan');
});

test('60 pertandingan mode tim selesai dengan tim pemenang', () => {
  for (let seed = 1000; seed < 1060; seed++) {
    const g = runGame(seed, 4, 'team');
    assert.ok(['Merah', 'Biru'].includes(g.winnerTeam));
  }
});

test('timeout lelang oleh sistem menutup lelang', () => {
  const g = createGame({ keepOrder: true }, [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], () => 0.5);
  applyAction(g, 'A', { type: 'roll' }, (() => { const q = [0.01, 0.2]; return () => q.shift() ?? 0.5; })());
  if (g.phase !== 'buy') return;
  applyAction(g, 'A', { type: 'decline' });
  applyAction(g, 'B', { type: 'bid', amount: 100_000 });
  assert.equal(applyAction(g, SYSTEM, { type: 'auction_timeout' }).ok, true);
  assert.notEqual(g.phase, 'auction');
});
