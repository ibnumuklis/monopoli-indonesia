// Monopoli Indonesia — Game Engine (server-authoritative).
// Engine murni: seluruh state berbentuk JSON, seluruh perubahan lewat applyAction().
// Klien tidak pernah menjalankan fungsi ini untuk mengubah state; klien hanya merender.
import {
  TILES, GROUPS, TRANSPORT_RENT, UTILITY_MULT, JAIL_INDEX, JAIL_FINE, MAX_HOUSES, MAX_HOTELS,
  BUYABLE, groupTiles, formatRp,
} from './board.js';
import { CARDS } from './cards.js';

export const SYSTEM = '__system__';
const LOG_MAX = 400;

export const DEFAULT_SETTINGS = {
  startCash: 15_000_000,
  goSalary: 2_000_000,
  auction: true,
  turnSeconds: 45,
  timeLimitMin: 0, // 0 = tanpa batas waktu
  maxRounds: 0, // 0 = tanpa batas ronde
  teamRentFree: true,
};

// ---------------------------------------------------------------- utilities
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const die = (rng) => 1 + Math.floor(rng() * 6);
const idx = (g, id) => g.players.findIndex((p) => p.id === id);
const cur = (g) => g.players[g.turn];
const alive = (g) => g.players.filter((p) => !p.bankrupt);

function log(g, type, text, data = {}) {
  g.seq += 1;
  g.log.push({ seq: g.seq, t: Date.now(), type, text, ...data });
  if (g.log.length > LOG_MAX) g.log.splice(0, g.log.length - LOG_MAX);
}

function txn(g, from, to, amount, reason) {
  // from/to: player id atau 'bank'
  g.txSeq += 1;
  g.transactions.push({ n: g.txSeq, t: Date.now(), from, to, amount, reason });
  if (g.transactions.length > 600) g.transactions.splice(0, g.transactions.length - 600);
}

export function ownedTiles(g, pid) {
  return Object.entries(g.props).filter(([, s]) => s.owner === pid).map(([i]) => Number(i));
}

export function hasMonopoly(g, pid, group) {
  return groupTiles(group).every((i) => g.props[i]?.owner === pid);
}

function countType(g, pid, type) {
  return ownedTiles(g, pid).filter((i) => TILES[i].type === type).length;
}

function sameTeam(g, a, b) {
  if (g.mode !== 'team') return false;
  const pa = g.players.find((p) => p.id === a);
  const pb = g.players.find((p) => p.id === b);
  return pa && pb && pa.team && pa.team === pb.team;
}

export function rentFor(g, tileIdx, diceTotal, opts = {}) {
  const t = TILES[tileIdx];
  const s = g.props[tileIdx];
  if (!s || !s.owner || s.mortgaged) return 0;
  if (t.type === 'property') {
    if (s.houses > 0) return t.rent[s.houses];
    return hasMonopoly(g, s.owner, t.group) ? t.rent[0] * 2 : t.rent[0];
  }
  if (t.type === 'transport') {
    const n = countType(g, s.owner, 'transport');
    return TRANSPORT_RENT[n - 1] * (opts.double ? 2 : 1);
  }
  if (t.type === 'utility') {
    const n = countType(g, s.owner, 'utility');
    const mult = opts.forceTen ? UTILITY_MULT[1] : UTILITY_MULT[Math.min(n, 2) - 1];
    return diceTotal * mult;
  }
  return 0;
}

export function buildingCounts(g) {
  let houses = 0, hotels = 0;
  for (const s of Object.values(g.props)) {
    if (s.houses === 5) hotels += 1; else houses += s.houses || 0;
  }
  return { houses, hotels };
}

export function netWorth(g, pid) {
  const p = g.players.find((x) => x.id === pid);
  if (!p || p.bankrupt) return 0;
  let v = p.cash;
  for (const i of ownedTiles(g, pid)) {
    const t = TILES[i]; const s = g.props[i];
    v += s.mortgaged ? t.price / 2 : t.price;
    if (t.type === 'property') v += s.houses * GROUPS[t.group].house;
  }
  return v;
}

/** Jumlah uang maksimal yang bisa dikumpulkan pemain (kas + jual bangunan + gadai). */
export function liquidity(g, pid) {
  const p = g.players.find((x) => x.id === pid);
  let v = p.cash;
  for (const i of ownedTiles(g, pid)) {
    const t = TILES[i]; const s = g.props[i];
    if (t.type === 'property' && s.houses) v += (s.houses * GROUPS[t.group].house) / 2;
    if (!s.mortgaged) v += t.mortgage;
  }
  return v;
}

// ---------------------------------------------------------------- creation
/**
 * @param {object} cfg { id, mode, settings }
 * @param {Array<{id,name,isBot,avatar,team,pawn}>} players
 * @param {() => number} rng
 */
export function createGame(cfg, players, rng = Math.random) {
  if (players.length < 2 || players.length > 4) throw new Error('Pemain harus 2–4 orang.');
  const settings = { ...DEFAULT_SETTINGS, ...(cfg.settings || {}) };
  const order = cfg.keepOrder ? players : shuffle(players, rng);
  const g = {
    id: cfg.id || 'game',
    mode: cfg.mode || 'classic',
    status: 'playing',
    settings,
    players: order.map((p, n) => ({
      id: p.id, name: p.name, isBot: !!p.isBot, avatar: p.avatar || 'ibnu', pawn: p.pawn || null,
      team: p.team || null, color: ['#e23b3b', '#1f6feb', '#22a356', '#f5a623'][n],
      cash: settings.startCash, pos: 0, inJail: false, jailTurns: 0, jailCards: [],
      bankrupt: false, bankruptAt: null, connected: true, auto: false,
      stats: { rentReceived: 0, rentPaid: 0, bought: 0, built: 0, passedStart: 0, doubles: 0, cards: 0, jailVisits: 0, taxPaid: 0 },
    })),
    turn: 0,
    round: 1,
    turnCount: 1,
    phase: 'roll',
    doublesCount: 0,
    extraRoll: false,
    lastRoll: null,
    diceHistory: [],
    props: {},
    decks: {
      chance: shuffle(CARDS.chance.map((c) => c.id), rng),
      chest: shuffle(CARDS.chest.map((c) => c.id), rng),
      budaya: shuffle(CARDS.budaya.map((c) => c.id), rng),
    },
    lastCard: null,
    pendingPurchase: null,
    auction: null,
    debts: [],
    afterDebt: null,
    trades: [],
    tradeSeq: 0,
    endVotes: [],
    startedAt: Date.now(),
    endsAt: settings.timeLimitMin ? Date.now() + settings.timeLimitMin * 60_000 : null,
    turnStartedAt: Date.now(),
    finishedAt: null,
    winner: null,
    winnerTeam: null,
    ranking: null,
    endReason: null,
    seq: 0,
    txSeq: 0,
    log: [],
    transactions: [],
  };
  for (const t of TILES) if (BUYABLE.has(t.type)) g.props[t.i] = { owner: null, houses: 0, mortgaged: false };
  log(g, 'start', `Permainan dimulai! Urutan: ${g.players.map((p) => p.name).join(' → ')}.`);
  log(g, 'turn', `Giliran ${cur(g).name}.`, { player: cur(g).id });
  return g;
}

// ---------------------------------------------------------------- money
function pay(g, fromIdx, toIdx, amount, reason) {
  const from = fromIdx == null ? null : g.players[fromIdx];
  const to = toIdx == null ? null : g.players[toIdx];
  if (from) from.cash -= amount;
  if (to) to.cash += amount;
  txn(g, from ? from.id : 'bank', to ? to.id : 'bank', amount, reason);
}

/** Tagih pemain. Jika kas kurang → masuk antrean utang (fase 'debt'), atau bangkrut otomatis jika aset tak cukup. */
function charge(g, payerIdx, amount, creditorIdx, reason) {
  if (amount <= 0) return;
  const p = g.players[payerIdx];
  if (p.bankrupt) return;
  if (p.cash >= amount) {
    pay(g, payerIdx, creditorIdx, amount, reason);
    return;
  }
  if (liquidity(g, p.id) >= amount) {
    g.debts.push({ debtor: p.id, creditor: creditorIdx == null ? null : g.players[creditorIdx].id, amount, reason });
    log(g, 'debt', `${p.name} harus membayar ${formatRp(amount)} (${reason}) tetapi kas kurang. Jual bangunan atau gadaikan aset.`, { player: p.id, amount });
    return;
  }
  // tidak mampu membayar sama sekali → serahkan seluruh kas, lalu bangkrut
  log(g, 'debt', `${p.name} tidak mampu membayar ${formatRp(amount)} (${reason}).`, { player: p.id });
  declareBankrupt(g, payerIdx, creditorIdx);
}

function declareBankrupt(g, pIdx, creditorIdx) {
  const p = g.players[pIdx];
  if (p.bankrupt) return;
  const creditor = creditorIdx == null ? null : g.players[creditorIdx];
  // Bangunan dijual ke bank setengah harga lebih dulu (nilai mengalir ke kreditor).
  for (const i of ownedTiles(g, p.id)) {
    const t = TILES[i]; const s = g.props[i];
    if (t.type === 'property' && s.houses) {
      p.cash += (s.houses * GROUPS[t.group].house) / 2;
      s.houses = 0;
    }
  }
  if (creditor && !creditor.bankrupt) {
    if (p.cash > 0) pay(g, pIdx, creditorIdx, p.cash, 'Penyerahan aset bangkrut');
    for (const i of ownedTiles(g, p.id)) g.props[i].owner = creditor.id;
    creditor.jailCards.push(...p.jailCards);
  } else {
    if (p.cash > 0) pay(g, pIdx, null, p.cash, 'Penyerahan aset bangkrut ke bank');
    for (const i of ownedTiles(g, p.id)) g.props[i] = { owner: null, houses: 0, mortgaged: false };
    for (const c of p.jailCards) returnCard(g, c);
  }
  p.jailCards = [];
  p.cash = 0;
  p.bankrupt = true;
  p.bankruptAt = Date.now();
  p.inJail = false;
  g.debts = g.debts.filter((d) => d.debtor !== p.id);
  g.trades = g.trades.filter((t) => t.from !== p.id && t.to !== p.id);
  if (g.auction) {
    g.auction.passed = [...new Set([...g.auction.passed, p.id])];
    if (g.auction.highBidder === p.id) { g.auction.highBid = 0; g.auction.highBidder = null; }
  }
  log(g, 'bankrupt', `${p.name} BANGKRUT${creditor ? ` — seluruh aset diserahkan ke ${creditor.name}` : ''}.`, { player: p.id });
  checkWin(g);
}

function returnCard(g, cardId) {
  const deck = cardId.startsWith('c') ? 'chance' : cardId.startsWith('d') ? 'chest' : 'budaya';
  g.decks[deck].push(cardId);
}

// ---------------------------------------------------------------- movement
function passStart(g, pIdx) {
  const p = g.players[pIdx];
  pay(g, null, pIdx, g.settings.goSalary, 'Gaji melewati START');
  p.stats.passedStart += 1;
  log(g, 'salary', `${p.name} melewati START dan menerima ${formatRp(g.settings.goSalary)}.`, { player: p.id });
}

function moveBy(g, pIdx, steps) {
  const p = g.players[pIdx];
  const from = p.pos;
  const to = (((from + steps) % 40) + 40) % 40;
  p.pos = to;
  log(g, 'move', `${p.name} bergerak ke ${TILES[to].name}.`, { player: p.id, from, to, steps });
  if (steps > 0 && to < from) passStart(g, pIdx);
}

function moveTo(g, pIdx, to, collectGo = true) {
  const p = g.players[pIdx];
  const from = p.pos;
  const steps = (to - from + 40) % 40;
  p.pos = to;
  log(g, 'move', `${p.name} pindah ke ${TILES[to].name}.`, { player: p.id, from, to, steps, jump: true });
  if (collectGo && to < from) passStart(g, pIdx);
  if (collectGo && to === 0 && from === 0) passStart(g, pIdx);
}

function sendToJail(g, pIdx) {
  const p = g.players[pIdx];
  const from = p.pos;
  p.pos = JAIL_INDEX;
  p.inJail = true;
  p.jailTurns = 0;
  p.stats.jailVisits += 1;
  g.extraRoll = false;
  g.doublesCount = 0;
  log(g, 'jail', `${p.name} masuk PENJARA!`, { player: p.id, from, to: JAIL_INDEX, jump: true });
}

// ---------------------------------------------------------------- landing
function resolveLanding(g, pIdx, opts = {}) {
  const p = g.players[pIdx];
  const t = TILES[p.pos];
  switch (t.type) {
    case 'property': case 'transport': case 'utility': {
      const s = g.props[t.i];
      if (!s.owner) {
        g.pendingPurchase = t.i;
        g.phase = 'buy';
        log(g, 'offer', `${t.name} belum dimiliki. Harga ${formatRp(t.price)}.`, { player: p.id, tile: t.i });
        return;
      }
      if (s.owner === p.id) { log(g, 'info', `${p.name} singgah di propertinya sendiri.`); return; }
      if (s.mortgaged) { log(g, 'info', `${t.name} sedang digadaikan — tidak ada sewa.`); return; }
      const ownerIdx = idx(g, s.owner);
      const owner = g.players[ownerIdx];
      if (owner.bankrupt) return;
      if (g.mode === 'team' && g.settings.teamRentFree && sameTeam(g, p.id, owner.id)) {
        log(g, 'info', `${t.name} milik rekan setim — bebas sewa.`); return;
      }
      if (owner.inJail && g.settings.noRentInJail) return;
      const total = g.lastRoll ? g.lastRoll.dice[0] + g.lastRoll.dice[1] : 7;
      const rent = rentFor(g, t.i, total, opts);
      p.stats.rentPaid += rent;
      owner.stats.rentReceived += rent;
      log(g, 'rent', `${p.name} membayar sewa ${formatRp(rent)} kepada ${owner.name} (${t.name}).`, { player: p.id, to: owner.id, amount: rent, tile: t.i });
      charge(g, pIdx, rent, ownerIdx, `Sewa ${t.name}`);
      return;
    }
    case 'tax':
      p.stats.taxPaid += t.amount;
      log(g, 'tax', `${p.name} membayar ${t.name} ${formatRp(t.amount)}.`, { player: p.id, amount: t.amount });
      charge(g, pIdx, t.amount, null, t.name);
      return;
    case 'chance': case 'chest': case 'budaya':
      drawCard(g, pIdx, t.type);
      return;
    case 'gotojail':
      sendToJail(g, pIdx);
      return;
    default:
      return;
  }
}

function drawCard(g, pIdx, deck) {
  const p = g.players[pIdx];
  const id = g.decks[deck].shift();
  const card = CARDS[deck].find((c) => c.id === id);
  p.stats.cards += 1;
  g.lastCard = { id, deck, player: p.id, seq: g.seq + 1 };
  log(g, 'card', `${p.name} mengambil kartu ${deck === 'chance' ? 'Kesempatan' : deck === 'chest' ? 'Dana Umum' : 'Budaya'}: "${card.title}" — ${card.text}`, { player: p.id, card: id, deck });
  const e = card.effect;
  if (e.kind !== 'jailFree') g.decks[deck].push(id);
  switch (e.kind) {
    case 'money':
      if (e.amount >= 0) pay(g, null, pIdx, e.amount, card.title);
      else charge(g, pIdx, -e.amount, null, card.title);
      break;
    case 'moveTo':
      moveTo(g, pIdx, e.to, true);
      resolveLanding(g, pIdx);
      break;
    case 'moveBy':
      moveBy(g, pIdx, e.steps);
      resolveLanding(g, pIdx);
      break;
    case 'nearest': {
      let i = p.pos;
      do { i = (i + 1) % 40; } while (TILES[i].type !== e.target);
      moveTo(g, pIdx, i, true);
      resolveLanding(g, pIdx, e.target === 'transport' ? { double: true } : { forceTen: true });
      break;
    }
    case 'jail':
      sendToJail(g, pIdx);
      break;
    case 'jailFree':
      p.jailCards.push(id);
      break;
    case 'repairs': {
      let total = 0;
      for (const i of ownedTiles(g, p.id)) {
        const h = g.props[i].houses || 0;
        total += h === 5 ? e.hotel : h * e.house;
      }
      if (total > 0) {
        log(g, 'tax', `${p.name} membayar biaya perbaikan ${formatRp(total)}.`, { player: p.id, amount: total });
        charge(g, pIdx, total, null, card.title);
      }
      break;
    }
    case 'collectEach':
      g.players.forEach((o, oi) => { if (oi !== pIdx && !o.bankrupt) charge(g, oi, e.amount, pIdx, card.title); });
      break;
    case 'payEach':
      g.players.forEach((o, oi) => { if (oi !== pIdx && !o.bankrupt && !p.bankrupt) charge(g, pIdx, e.amount, oi, card.title); });
      break;
    default: break;
  }
}

// ---------------------------------------------------------------- flow
function waiting(g) {
  return g.status !== 'playing' || g.phase === 'buy' || g.phase === 'auction' || g.debts.length > 0;
}

/** Lanjutkan alur setelah sebuah langkah selesai. */
function continueFlow(g) {
  if (g.status !== 'playing') return;
  if (g.debts.length) { g.phase = 'debt'; return; }
  if (g.afterDebt) {
    const a = g.afterDebt; g.afterDebt = null;
    if (a.type === 'jailMove') {
      const pIdx = idx(g, a.player);
      const p = g.players[pIdx];
      if (!p.bankrupt) {
        p.inJail = false; p.jailTurns = 0;
        moveBy(g, pIdx, a.steps);
        resolveLanding(g, pIdx);
        if (waiting(g)) { if (g.debts.length) g.phase = 'debt'; return; }
      }
    }
  }
  if (g.phase === 'buy' || g.phase === 'auction') return;
  const p = cur(g);
  if (p.bankrupt) { nextTurn(g); return; }
  g.phase = g.extraRoll && !p.inJail ? 'roll' : 'end';
  if (g.phase === 'roll') log(g, 'info', `${p.name} mendapat dadu kembar — lempar lagi!`, { player: p.id });
}

function nextTurn(g) {
  if (g.status !== 'playing') return;
  g.trades = []; // tawaran dagang kedaluwarsa saat giliran berganti
  g.extraRoll = false;
  g.doublesCount = 0;
  g.pendingPurchase = null;
  const n = g.players.length;
  let next = g.turn;
  for (let k = 0; k < n; k++) {
    next = (next + 1) % n;
    if (!g.players[next].bankrupt) break;
  }
  if (next <= g.turn) g.round += 1;
  g.turn = next;
  g.turnCount += 1;
  g.phase = 'roll';
  g.turnStartedAt = Date.now();
  const p = cur(g);
  log(g, 'turn', `Giliran ${p.name}${p.inJail ? ' (di penjara)' : ''}.`, { player: p.id });
  if (g.settings.maxRounds && g.round > g.settings.maxRounds) finishByWorth(g, 'rounds');
}

function checkWin(g) {
  if (g.status !== 'playing') return;
  const left = alive(g);
  if (g.mode === 'team') {
    const teams = new Set(left.map((p) => p.team));
    if (teams.size <= 1) return finish(g, 'team', left[0]);
    return;
  }
  if (left.length <= 1) finish(g, 'last', left[0]);
}

function rankPlayers(g) {
  const living = alive(g).sort((a, b) => netWorth(g, b.id) - netWorth(g, a.id));
  const dead = g.players.filter((p) => p.bankrupt).sort((a, b) => b.bankruptAt - a.bankruptAt);
  return [...living, ...dead].map((p, n) => ({
    id: p.id, name: p.name, place: n + 1, team: p.team, isBot: p.isBot, bankrupt: p.bankrupt,
    cash: p.cash, netWorth: netWorth(g, p.id), properties: ownedTiles(g, p.id).length,
    buildings: ownedTiles(g, p.id).reduce((s, i) => s + (g.props[i].houses || 0), 0),
    rentReceived: p.stats.rentReceived, stats: p.stats,
  }));
}

function finish(g, reason, winnerPlayer) {
  g.status = 'finished';
  g.phase = 'finished';
  g.finishedAt = Date.now();
  g.endReason = reason;
  g.ranking = rankPlayers(g);
  if (g.mode === 'team') {
    const teamWorth = {};
    for (const r of g.ranking) teamWorth[r.team] = (teamWorth[r.team] || 0) + r.netWorth;
    const aliveTeams = new Set(alive(g).map((p) => p.team));
    const best = Object.entries(teamWorth).filter(([t]) => reason !== 'team' || aliveTeams.has(t)).sort((a, b) => b[1] - a[1])[0];
    g.winnerTeam = best ? best[0] : null;
    g.winner = g.ranking.find((r) => r.team === g.winnerTeam)?.id || null;
    log(g, 'win', `Tim ${g.winnerTeam} MENANG! (${reasonText(reason)})`, { team: g.winnerTeam });
  } else {
    g.winner = winnerPlayer ? winnerPlayer.id : g.ranking[0].id;
    const w = g.players.find((p) => p.id === g.winner);
    log(g, 'win', `${w.name} MENANG! (${reasonText(reason)})`, { player: w.id });
  }
}

function reasonText(r) {
  return { last: 'pemain terakhir yang bertahan', team: 'tim lawan bangkrut', vote: 'kesepakatan semua pemain — total aset tertinggi', time: 'batas waktu habis — total aset tertinggi', rounds: 'batas ronde tercapai — total aset tertinggi', forfeit: 'lawan meninggalkan permainan' }[r] || r;
}

function finishByWorth(g, reason) {
  if (g.status !== 'playing') return;
  if (g.mode === 'team') return finish(g, reason, null);
  const best = alive(g).sort((a, b) => netWorth(g, b.id) - netWorth(g, a.id))[0];
  finish(g, reason, best);
}

// ---------------------------------------------------------------- building helpers
function canBuildOn(g, pid, i) {
  const t = TILES[i]; const s = g.props[i];
  if (t.type !== 'property') return 'Hanya properti kota yang bisa dibangun.';
  if (s.owner !== pid) return 'Bukan properti Anda.';
  if (!hasMonopoly(g, pid, t.group)) return `Kuasai seluruh kota ${GROUPS[t.group].name} terlebih dahulu.`;
  const tiles = groupTiles(t.group);
  if (tiles.some((j) => g.props[j].mortgaged)) return 'Tebus semua properti di kelompok ini dahulu.';
  if (s.houses >= 5) return 'Sudah ada hotel.';
  const min = Math.min(...tiles.map((j) => g.props[j].houses));
  if (s.houses > min) return 'Bangun merata: kota lain di kelompok ini harus dibangun dahulu.';
  const { houses, hotels } = buildingCounts(g);
  if (s.houses === 4 && hotels >= MAX_HOTELS) return 'Stok hotel bank habis.';
  if (s.houses < 4 && houses >= MAX_HOUSES) return 'Stok rumah bank habis.';
  return null;
}

function canSellOn(g, pid, i) {
  const t = TILES[i]; const s = g.props[i];
  if (t.type !== 'property' || s.owner !== pid) return 'Bukan properti Anda.';
  if (!s.houses) return 'Tidak ada bangunan.';
  const tiles = groupTiles(t.group);
  const max = Math.max(...tiles.map((j) => g.props[j].houses));
  if (s.houses < max) return 'Jual merata: kurangi bangunan di kota tertinggi dahulu.';
  if (s.houses === 5 && buildingCounts(g).houses > MAX_HOUSES - 4) return 'Stok rumah bank tidak cukup untuk menurunkan hotel.';
  return null;
}

// ---------------------------------------------------------------- permissions
function canManage(g, pid) {
  // Kelola aset (bangun/jual/gadai/tebus): pemain yang sedang giliran pada fase roll/end, atau debitur pada fase debt.
  if (g.status !== 'playing') return false;
  if (g.phase === 'debt') return g.debts[0]?.debtor === pid;
  return cur(g).id === pid && (g.phase === 'roll' || g.phase === 'end');
}

export function pendingActors(g) {
  if (g.status !== 'playing') return [];
  if (g.phase === 'debt' && g.debts.length) return [g.debts[0].debtor];
  if (g.phase === 'auction' && g.auction) {
    return alive(g).map((p) => p.id).filter((id) => !g.auction.passed.includes(id) && id !== g.auction.highBidder);
  }
  return [cur(g).id];
}

// ---------------------------------------------------------------- actions
const ok = () => ({ ok: true });
const err = (error) => ({ ok: false, error });

/**
 * Terapkan aksi pemain. Mengembalikan {ok, error}.
 * @param {object} g state
 * @param {string} actor id pemain atau SYSTEM
 * @param {{type:string}} a aksi
 * @param {() => number} rng sumber acak (server: crypto)
 */
export function applyAction(g, actor, a, rng = Math.random) {
  if (!a || typeof a.type !== 'string') return err('Aksi tidak valid.');
  if (g.status !== 'playing') return err('Permainan sudah selesai.');
  const pIdx = idx(g, actor);
  const p = g.players[pIdx];
  if (actor !== SYSTEM && (!p || p.bankrupt)) return err('Anda tidak aktif dalam permainan ini.');
  const isCur = p && cur(g).id === actor;

  switch (a.type) {
    case 'roll': {
      if (!isCur) return err('Belum giliran Anda.');
      if (g.phase !== 'roll') return err('Tidak dapat melempar dadu sekarang.');
      const dice = [die(rng), die(rng)];
      const doubles = dice[0] === dice[1];
      const total = dice[0] + dice[1];
      g.lastRoll = { dice, player: p.id, seq: g.seq + 1, doubles };
      g.diceHistory.push({ player: p.id, dice, round: g.round, t: Date.now() });
      if (g.diceHistory.length > 200) g.diceHistory.shift();
      log(g, 'roll', `${p.name} melempar dadu: ${dice[0]} + ${dice[1]} = ${total}${doubles ? ' (KEMBAR!)' : ''}.`, { player: p.id, dice });
      if (doubles) p.stats.doubles += 1;
      if (p.inJail) {
        g.extraRoll = false;
        if (doubles) {
          p.inJail = false; p.jailTurns = 0;
          log(g, 'jail', `${p.name} keluar dari penjara dengan dadu kembar!`, { player: p.id });
          moveBy(g, pIdx, total);
          resolveLanding(g, pIdx);
          continueFlow(g);
          return ok();
        }
        p.jailTurns += 1;
        if (p.jailTurns >= 3) {
          log(g, 'jail', `${p.name} gagal 3 kali dan wajib membayar denda ${formatRp(JAIL_FINE)}.`, { player: p.id });
          g.afterDebt = { type: 'jailMove', player: p.id, steps: total };
          charge(g, pIdx, JAIL_FINE, null, 'Denda penjara');
          if (p.bankrupt) { g.afterDebt = null; nextTurn(g); return ok(); }
          continueFlow(g);
          return ok();
        }
        log(g, 'jail', `${p.name} tetap di penjara (percobaan ${p.jailTurns}/3).`, { player: p.id });
        g.phase = 'end';
        return ok();
      }
      if (doubles) {
        g.doublesCount += 1;
        if (g.doublesCount >= 3) {
          log(g, 'jail', `${p.name} mendapat dadu kembar 3 kali berturut-turut!`, { player: p.id });
          sendToJail(g, pIdx);
          g.phase = 'end';
          return ok();
        }
        g.extraRoll = true;
      } else {
        g.extraRoll = false;
      }
      moveBy(g, pIdx, total);
      resolveLanding(g, pIdx);
      if (p.bankrupt && g.status === 'playing') { nextTurn(g); return ok(); }
      continueFlow(g);
      return ok();
    }

    case 'pay_jail': {
      if (!isCur || g.phase !== 'roll' || !p.inJail) return err('Tidak sedang di penjara.');
      if (p.cash < JAIL_FINE) return err('Kas tidak cukup untuk membayar denda.');
      pay(g, pIdx, null, JAIL_FINE, 'Denda penjara');
      p.inJail = false; p.jailTurns = 0;
      log(g, 'jail', `${p.name} membayar denda ${formatRp(JAIL_FINE)} dan bebas.`, { player: p.id });
      return ok();
    }

    case 'use_jail_card': {
      if (!isCur || g.phase !== 'roll' || !p.inJail) return err('Tidak sedang di penjara.');
      if (!p.jailCards.length) return err('Anda tidak memiliki kartu bebas penjara.');
      const c = p.jailCards.shift();
      returnCard(g, c);
      p.inJail = false; p.jailTurns = 0;
      log(g, 'jail', `${p.name} menggunakan kartu Bebas dari Penjara.`, { player: p.id });
      return ok();
    }

    case 'buy': {
      if (!isCur || g.phase !== 'buy') return err('Tidak ada properti untuk dibeli.');
      const t = TILES[g.pendingPurchase];
      if (p.cash < t.price) return err(`Kas tidak cukup. Butuh ${formatRp(t.price)}.`);
      pay(g, pIdx, null, t.price, `Beli ${t.name}`);
      g.props[t.i].owner = p.id;
      p.stats.bought += 1;
      g.pendingPurchase = null;
      g.phase = 'roll'; // sementara; continueFlow menentukan fase akhir
      log(g, 'buy', `${p.name} membeli ${t.name} seharga ${formatRp(t.price)}.`, { player: p.id, tile: t.i, amount: t.price });
      continueFlow(g);
      return ok();
    }

    case 'decline': {
      if (!isCur || g.phase !== 'buy') return err('Tidak ada properti untuk ditolak.');
      const t = TILES[g.pendingPurchase];
      g.pendingPurchase = null;
      if (g.settings.auction && alive(g).length > 1) {
        g.auction = { tile: t.i, highBid: 0, highBidder: null, passed: [], startedAt: Date.now(), lastBidAt: Date.now() };
        g.phase = 'auction';
        log(g, 'auction', `${p.name} tidak membeli ${t.name}. LELANG dimulai!`, { tile: t.i });
      } else {
        log(g, 'info', `${p.name} tidak membeli ${t.name}.`, { tile: t.i });
        g.phase = 'roll';
        continueFlow(g);
      }
      return ok();
    }

    case 'bid': {
      if (g.phase !== 'auction' || !g.auction) return err('Tidak ada lelang.');
      if (actor === SYSTEM) return err('Aksi tidak valid.');
      if (g.auction.passed.includes(actor)) return err('Anda sudah mundur dari lelang.');
      const amount = Math.floor(Number(a.amount));
      if (!Number.isFinite(amount) || amount <= g.auction.highBid) return err('Tawaran harus lebih tinggi dari tawaran tertinggi.');
      if (amount % 10_000 !== 0) return err('Tawaran harus kelipatan Rp10.000.');
      if (amount > p.cash) return err('Tawaran melebihi kas Anda.');
      g.auction.highBid = amount;
      g.auction.highBidder = actor;
      g.auction.lastBidAt = Date.now();
      log(g, 'bid', `${p.name} menawar ${formatRp(amount)}.`, { player: actor, amount });
      maybeCloseAuction(g);
      return ok();
    }

    case 'pass_auction': {
      if (g.phase !== 'auction' || !g.auction) return err('Tidak ada lelang.');
      if (actor === SYSTEM) return err('Aksi tidak valid.');
      if (g.auction.passed.includes(actor)) return err('Sudah mundur.');
      if (g.auction.highBidder === actor) return err('Anda pemegang tawaran tertinggi.');
      g.auction.passed.push(actor);
      log(g, 'bid', `${p.name} mundur dari lelang.`, { player: actor });
      maybeCloseAuction(g);
      return ok();
    }

    case 'auction_timeout': {
      if (actor !== SYSTEM || g.phase !== 'auction') return err('Aksi tidak valid.');
      closeAuction(g);
      return ok();
    }

    case 'build': case 'sell_building': case 'mortgage': case 'unmortgage': {
      if (!canManage(g, actor)) return err('Anda hanya dapat mengelola aset pada giliran Anda.');
      const i = Number(a.tile);
      const t = TILES[i]; const s = g.props[i];
      if (!t || !s) return err('Petak tidak valid.');
      if (a.type === 'build') {
        const why = canBuildOn(g, actor, i); if (why) return err(why);
        const cost = GROUPS[t.group].house;
        if (p.cash < cost) return err(`Kas tidak cukup. Butuh ${formatRp(cost)}.`);
        pay(g, pIdx, null, cost, `Bangun di ${t.name}`);
        s.houses += 1; p.stats.built += 1;
        log(g, 'build', `${p.name} membangun ${s.houses === 5 ? 'HOTEL' : `rumah ke-${s.houses}`} di ${t.name}.`, { player: actor, tile: i, houses: s.houses });
      } else if (a.type === 'sell_building') {
        const why = canSellOn(g, actor, i); if (why) return err(why);
        const refund = GROUPS[t.group].house / 2;
        s.houses -= 1;
        pay(g, null, pIdx, refund, `Jual bangunan ${t.name}`);
        log(g, 'sell', `${p.name} menjual bangunan di ${t.name} (+${formatRp(refund)}).`, { player: actor, tile: i, houses: s.houses });
      } else if (a.type === 'mortgage') {
        if (s.owner !== actor) return err('Bukan properti Anda.');
        if (s.mortgaged) return err('Sudah digadaikan.');
        if (t.type === 'property' && groupTiles(t.group).some((j) => g.props[j].houses > 0)) return err('Jual seluruh bangunan di kelompok ini terlebih dahulu.');
        s.mortgaged = true;
        pay(g, null, pIdx, t.mortgage, `Gadai ${t.name}`);
        log(g, 'mortgage', `${p.name} menggadaikan ${t.name} (+${formatRp(t.mortgage)}).`, { player: actor, tile: i });
      } else {
        if (s.owner !== actor) return err('Bukan properti Anda.');
        if (!s.mortgaged) return err('Properti tidak sedang digadaikan.');
        const cost = Math.round(t.mortgage * 1.1);
        if (p.cash < cost) return err(`Kas tidak cukup. Butuh ${formatRp(cost)}.`);
        s.mortgaged = false;
        pay(g, pIdx, null, cost, `Tebus ${t.name}`);
        log(g, 'mortgage', `${p.name} menebus ${t.name} (-${formatRp(cost)}).`, { player: actor, tile: i });
      }
      return ok();
    }

    case 'pay_debt': {
      if (g.phase !== 'debt' || g.debts[0]?.debtor !== actor) return err('Anda tidak memiliki utang yang harus dibayar.');
      const d = g.debts[0];
      if (p.cash < d.amount) return err(`Kas belum cukup. Kurang ${formatRp(d.amount - p.cash)}.`);
      g.debts.shift();
      pay(g, pIdx, d.creditor ? idx(g, d.creditor) : null, d.amount, d.reason);
      log(g, 'pay', `${p.name} melunasi ${formatRp(d.amount)} (${d.reason}).`, { player: actor, amount: d.amount });
      continueFlow(g);
      return ok();
    }

    case 'bankrupt': {
      // Menyerah: boleh kapan saja oleh pemain aktif (juga dipakai saat meninggalkan permainan).
      const d = g.debts.find((x) => x.debtor === actor);
      const creditorIdx = d && d.creditor ? idx(g, d.creditor) : null;
      const wasCur = isCur;
      declareBankrupt(g, pIdx, creditorIdx);
      if (g.status !== 'playing') return ok();
      if (wasCur) {
        g.afterDebt = null; g.pendingPurchase = null;
        if (g.auction) closeAuction(g); else nextTurn(g);
      }
      else if (g.phase === 'debt' && !g.debts.length) continueFlow(g);
      else if (g.phase === 'auction') maybeCloseAuction(g);
      return ok();
    }

    case 'end_turn': {
      if (!isCur) return err('Belum giliran Anda.');
      if (g.phase !== 'end') return err(g.phase === 'roll' ? 'Lempar dadu terlebih dahulu.' : 'Selesaikan aksi yang tertunda terlebih dahulu.');
      nextTurn(g);
      return ok();
    }

    case 'propose_trade': {
      if (!isCur || (g.phase !== 'roll' && g.phase !== 'end')) return err('Tawaran dagang hanya dapat dibuat pada giliran Anda.');
      const to = g.players.find((x) => x.id === a.to);
      if (!to || to.bankrupt || to.id === actor) return err('Tujuan tawaran tidak valid.');
      const offer = sanitizeSide(a.offer); const request = sanitizeSide(a.request);
      if (!offer.cash && !offer.tiles.length && !request.cash && !request.tiles.length && !offer.jailCards && !request.jailCards) return err('Tawaran kosong.');
      const why = validateTrade(g, actor, to.id, offer, request);
      if (why) return err(why);
      if (g.trades.filter((t) => t.from === actor && t.status === 'pending').length >= 3) return err('Maksimal 3 tawaran aktif.');
      g.tradeSeq += 1;
      g.trades.push({ id: g.tradeSeq, from: actor, to: to.id, offer, request, status: 'pending' });
      log(g, 'trade', `${p.name} mengajukan tawaran dagang kepada ${to.name}.`, { player: actor, to: to.id, trade: g.tradeSeq });
      return ok();
    }

    case 'respond_trade': {
      const tr = g.trades.find((t) => t.id === Number(a.id) && t.status === 'pending');
      if (!tr) return err('Tawaran tidak ditemukan atau sudah kedaluwarsa.');
      if (tr.to !== actor && !(a.cancel && tr.from === actor)) return err('Bukan tawaran untuk Anda.');
      if (a.cancel || !a.accept) {
        tr.status = a.cancel ? 'cancelled' : 'rejected';
        g.trades = g.trades.filter((t) => t !== tr);
        log(g, 'trade', `Tawaran dagang ${a.cancel ? 'dibatalkan' : 'ditolak'}.`, { trade: tr.id });
        return ok();
      }
      const why = validateTrade(g, tr.from, tr.to, tr.offer, tr.request);
      if (why) return err(`Tawaran tidak lagi valid: ${why}`);
      executeTrade(g, tr);
      g.trades = g.trades.filter((t) => t !== tr);
      return ok();
    }

    case 'vote_end': {
      if (actor === SYSTEM) return err('Aksi tidak valid.');
      if (g.endVotes.includes(actor)) {
        g.endVotes = g.endVotes.filter((x) => x !== actor);
        log(g, 'vote', `${p.name} membatalkan usulan mengakhiri permainan.`);
        return ok();
      }
      g.endVotes.push(actor);
      const voters = alive(g).filter((x) => !x.isBot).map((x) => x.id);
      log(g, 'vote', `${p.name} setuju mengakhiri permainan (${g.endVotes.filter((v) => voters.includes(v)).length}/${voters.length}).`, { player: actor });
      if (voters.every((v) => g.endVotes.includes(v))) finishByWorth(g, 'vote');
      return ok();
    }

    case 'time_up': {
      if (actor !== SYSTEM) return err('Aksi tidak valid.');
      finishByWorth(g, 'time');
      return ok();
    }

    default:
      return err('Aksi tidak dikenal.');
  }
}

function maybeCloseAuction(g) {
  const a = g.auction;
  const bidders = alive(g).map((p) => p.id);
  const active = bidders.filter((id) => !a.passed.includes(id));
  if ((a.highBidder && active.length <= 1) || active.length === 0) closeAuction(g);
}

function closeAuction(g) {
  const a = g.auction;
  const t = TILES[a.tile];
  if (a.highBidder) {
    const wIdx = idx(g, a.highBidder);
    const w = g.players[wIdx];
    if (w && !w.bankrupt && w.cash >= a.highBid) {
      pay(g, wIdx, null, a.highBid, `Lelang ${t.name}`);
      g.props[a.tile].owner = w.id;
      w.stats.bought += 1;
      log(g, 'buy', `${w.name} memenangkan lelang ${t.name} seharga ${formatRp(a.highBid)}.`, { player: w.id, tile: a.tile, amount: a.highBid });
    }
  } else {
    log(g, 'auction', `Tidak ada penawar. ${t.name} tetap milik bank.`, { tile: a.tile });
  }
  g.auction = null;
  g.phase = 'roll';
  continueFlow(g);
}

function sanitizeSide(s) {
  s = s || {};
  return {
    cash: Math.max(0, Math.floor(Number(s.cash) || 0)),
    tiles: Array.isArray(s.tiles) ? [...new Set(s.tiles.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < 40))].slice(0, 28) : [],
    jailCards: Math.max(0, Math.min(2, Math.floor(Number(s.jailCards) || 0))),
  };
}

function validateTrade(g, fromId, toId, offer, request) {
  const from = g.players.find((p) => p.id === fromId);
  const to = g.players.find((p) => p.id === toId);
  if (!from || !to || from.bankrupt || to.bankrupt) return 'Pemain tidak aktif.';
  if (offer.cash > from.cash) return `${from.name} tidak memiliki kas yang cukup.`;
  if (request.cash > to.cash) return `${to.name} tidak memiliki kas yang cukup.`;
  if (offer.jailCards > from.jailCards.length) return 'Kartu bebas penjara tidak cukup.';
  if (request.jailCards > to.jailCards.length) return 'Kartu bebas penjara lawan tidak cukup.';
  for (const [side, owner] of [[offer, fromId], [request, toId]]) {
    for (const i of side.tiles) {
      const s = g.props[i];
      if (!s || s.owner !== owner) return `${TILES[i]?.name || 'Petak'} bukan milik pemain tersebut.`;
      const t = TILES[i];
      if (t.type === 'property' && groupTiles(t.group).some((j) => g.props[j].houses > 0)) return `Jual bangunan di kelompok ${GROUPS[t.group].name} sebelum diperdagangkan.`;
    }
  }
  return null;
}

function executeTrade(g, tr) {
  const fi = idx(g, tr.from); const ti = idx(g, tr.to);
  const f = g.players[fi]; const t = g.players[ti];
  if (tr.offer.cash) pay(g, fi, ti, tr.offer.cash, 'Dagang');
  if (tr.request.cash) pay(g, ti, fi, tr.request.cash, 'Dagang');
  for (const i of tr.offer.tiles) g.props[i].owner = t.id;
  for (const i of tr.request.tiles) g.props[i].owner = f.id;
  for (let k = 0; k < tr.offer.jailCards; k++) t.jailCards.push(f.jailCards.shift());
  for (let k = 0; k < tr.request.jailCards; k++) f.jailCards.push(t.jailCards.shift());
  tr.status = 'accepted';
  log(g, 'trade', `${t.name} menerima tawaran dagang dari ${f.name}.`, { player: t.id, trade: tr.id });
}

// ---------------------------------------------------------------- views
/** State publik yang aman dikirim ke klien (tanpa urutan dek kartu). */
export function publicState(g) {
  const { decks, transactions, ...rest } = g;
  return {
    ...rest,
    log: g.log.slice(-60),
    deckSizes: { chance: decks.chance.length, chest: decks.chest.length, budaya: decks.budaya.length },
    recentTransactions: transactions.slice(-30),
    buildings: buildingCounts(g),
    worth: Object.fromEntries(g.players.map((p) => [p.id, netWorth(g, p.id)])),
    pendingActors: pendingActors(g),
  };
}

export { canBuildOn, canSellOn, canManage };
