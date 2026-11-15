// Bot AI Monopoli Indonesia. Memilih SATU aksi untuk pemain tertentu berdasarkan state.
// Digunakan untuk: pemain bot, auto-play saat waktu giliran habis, dan pemain yang terputus.
import { TILES, GROUPS, JAIL_FINE, groupTiles } from './board.js';
import { ownedTiles, hasMonopoly, canBuildOn, canSellOn, pendingActors, netWorth } from './engine.js';

const LEVELS = {
  easy: { reserve: 3_000_000, buyBias: 0.75, bidMax: 0.8, build: 0.4 },
  normal: { reserve: 2_000_000, buyBias: 1, bidMax: 1.0, build: 0.8 },
  hard: { reserve: 1_200_000, buyBias: 1.2, bidMax: 1.25, build: 1 },
};

function groupProgress(g, pid, group) {
  const tiles = groupTiles(group);
  return tiles.filter((i) => g.props[i].owner === pid).length / tiles.length;
}

function tileValue(g, pid, i) {
  const t = TILES[i];
  let v = t.price;
  if (t.type === 'property') {
    const prog = groupProgress(g, pid, t.group);
    v *= 1 + prog; // makin dekat monopoli, makin berharga
    // menghalangi monopoli lawan
    const owners = new Set(groupTiles(t.group).map((j) => g.props[j].owner).filter(Boolean));
    if (owners.size === 1 && !owners.has(pid)) v *= 1.3;
  }
  if (t.type === 'transport') v *= 1 + 0.25 * ownedTiles(g, pid).filter((j) => TILES[j].type === 'transport').length;
  return v;
}

/** Kembalikan aksi untuk pemain pid, atau null jika tidak ada yang perlu dilakukan. */
export function chooseBotAction(g, pid, level = 'normal', rng = Math.random) {
  if (g.status !== 'playing') return null;
  const L = LEVELS[level] || LEVELS.normal;
  const p = g.players.find((x) => x.id === pid);
  if (!p || p.bankrupt) return null;
  if (!pendingActors(g).includes(pid)) {
    // Bukan aksi wajib — tetapi bot boleh merespons tawaran dagang yang ditujukan kepadanya.
    const tr = g.trades.find((t) => t.to === pid && t.status === 'pending');
    if (tr) return { type: 'respond_trade', id: tr.id, accept: evaluateTrade(g, pid, tr) };
    return null;
  }

  // Tawaran dagang yang masuk saat giliran sendiri
  const incoming = g.trades.find((t) => t.to === pid && t.status === 'pending');
  if (incoming) return { type: 'respond_trade', id: incoming.id, accept: evaluateTrade(g, pid, incoming) };

  switch (g.phase) {
    case 'debt': {
      const d = g.debts[0];
      if (p.cash >= d.amount) return { type: 'pay_debt' };
      return raiseCash(g, pid) || { type: 'bankrupt' };
    }
    case 'auction': {
      const a = g.auction;
      const t = TILES[a.tile];
      const limit = Math.min(p.cash - L.reserve / 2, tileValue(g, pid, a.tile) * L.bidMax);
      const next = Math.ceil((a.highBid + Math.max(10_000, Math.round(t.price * 0.05 / 10_000) * 10_000)) / 10_000) * 10_000;
      if (next <= limit && next <= p.cash) return { type: 'bid', amount: next };
      return { type: 'pass_auction' };
    }
    case 'buy': {
      const t = TILES[g.pendingPurchase];
      const after = p.cash - t.price;
      const completes = t.type === 'property' && groupTiles(t.group).every((i) => i === t.i || g.props[i].owner === pid);
      const want = after >= L.reserve / L.buyBias || (completes && after >= 0) || (after >= 500_000 && rng() < 0.35 * L.buyBias);
      return { type: want && after >= 0 ? 'buy' : 'decline' };
    }
    case 'roll': {
      if (p.inJail) {
        const unowned = Object.values(g.props).filter((s) => !s.owner).length;
        if (p.jailCards.length) return { type: 'use_jail_card' };
        // Awal permainan (banyak properti tersedia) → keluar cepat. Akhir permainan → nikmati penjara.
        if (unowned > 8 && p.cash >= JAIL_FINE + L.reserve) return { type: 'pay_jail' };
        return { type: 'roll' };
      }
      const b = tryBuild(g, pid, L, rng);
      if (b) return b;
      const um = tryUnmortgage(g, pid, L);
      if (um) return um;
      return { type: 'roll' };
    }
    case 'end': {
      const b = tryBuild(g, pid, L, rng);
      if (b) return b;
      const um = tryUnmortgage(g, pid, L);
      if (um) return um;
      return { type: 'end_turn' };
    }
    default:
      return null;
  }
}

function tryBuild(g, pid, L, rng) {
  const p = g.players.find((x) => x.id === pid);
  if (rng() > L.build) return null;
  const groups = [...new Set(ownedTiles(g, pid).map((i) => TILES[i].group).filter(Boolean))].filter((gr) => hasMonopoly(g, pid, gr));
  // prioritaskan kelompok yang paling murah dibangun dulu hingga 3 rumah (ROI terbaik)
  const candidates = [];
  for (const gr of groups) {
    for (const i of groupTiles(gr)) {
      if (!canBuildOn(g, pid, i)) candidates.push(i);
    }
  }
  candidates.sort((a, b) => g.props[a].houses - g.props[b].houses || GROUPS[TILES[a].group].house - GROUPS[TILES[b].group].house);
  for (const i of candidates) {
    const cost = GROUPS[TILES[i].group].house;
    if (p.cash - cost >= L.reserve) return { type: 'build', tile: i };
  }
  return null;
}

function tryUnmortgage(g, pid, L) {
  const p = g.players.find((x) => x.id === pid);
  for (const i of ownedTiles(g, pid)) {
    const s = g.props[i];
    if (s.mortgaged && p.cash - TILES[i].mortgage * 1.1 >= L.reserve * 1.5) return { type: 'unmortgage', tile: i };
  }
  return null;
}

function raiseCash(g, pid) {
  const tiles = ownedTiles(g, pid);
  // 1) jual bangunan termurah
  const withHouses = tiles.filter((i) => g.props[i].houses > 0 && !canSellOn(g, pid, i))
    .sort((a, b) => GROUPS[TILES[a].group].house - GROUPS[TILES[b].group].house);
  if (withHouses.length) return { type: 'sell_building', tile: withHouses[0] };
  // 2) gadai properti yang tidak membentuk monopoli lebih dulu
  const mort = tiles.filter((i) => !g.props[i].mortgaged)
    .filter((i) => TILES[i].type !== 'property' || !groupTiles(TILES[i].group).some((j) => g.props[j].houses > 0))
    .sort((a, b) => {
      const ma = TILES[a].group && hasMonopoly(g, pid, TILES[a].group) ? 1 : 0;
      const mb = TILES[b].group && hasMonopoly(g, pid, TILES[b].group) ? 1 : 0;
      return ma - mb || TILES[a].price - TILES[b].price;
    });
  if (mort.length) return { type: 'mortgage', tile: mort[0] };
  return null;
}

function evaluateTrade(g, pid, tr) {
  const give = tr.request; const get = tr.offer;
  const val = (side, owner) => side.cash + side.tiles.reduce((s, i) => s + tileValue(g, owner, i), 0) + side.jailCards * 500_000;
  const gain = val(get, pid);
  const loss = val(give, pid);
  // jangan menyerahkan properti yang membuat lawan memonopoli
  for (const i of give.tiles) {
    const t = TILES[i];
    if (t.type === 'property') {
      const others = groupTiles(t.group).filter((j) => j !== i);
      if (others.every((j) => g.props[j].owner === tr.from)) return false;
    }
  }
  return gain >= loss * 1.15;
}

export function botName(n) {
  return ['Bot Arjuna', 'Bot Srikandi', 'Bot Gatotkaca', 'Bot Larasati', 'Bot Bima', 'Bot Sekar'][n % 6];
}

export { netWorth };
