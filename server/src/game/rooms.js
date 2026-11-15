// RoomManager: room, kursi pemain, start, aksi permainan (server-authoritative), timer giliran, bot,
// disconnect/reconnect, persistensi, pemulihan setelah restart, dan matchmaking.
import crypto from 'node:crypto';
import {
  createGame, applyAction, publicState, pendingActors, chooseBotAction, botName, SYSTEM, CHARACTERS,
} from '../../../shared/src/index.js';
import { config } from '../config.js';
import { createRoomRow, startSession, persistProgress, finalizeMatch, loadActiveSessions, abortSession, updateRoomStatus } from '../services/matches.js';
import { moderate, SpamGuard } from './moderation.js';
import { q, one } from '../db/index.js';

const secureRng = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
const MODES = new Set(['classic', 'team', 'practice', 'tournament', 'adventure']);
const BOT_LEVELS = new Set(['easy', 'normal', 'hard']);
const AUCTION_IDLE_MS = 12_000;
// Timer room tidak menahan proses (server HTTP yang menjaga proses tetap hidup); memudahkan shutdown bersih.
const T = (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; };

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // code → room
    this.userRoom = new Map(); // userId → code
    this.presence = new Map(); // userId → Set(socketId)
    this.queue = []; // matchmaking
    this.spam = new SpamGuard();
    this.mmTimer = setInterval(() => this.tickMatchmaking().catch((e) => console.error('[mm]', e)), 1000);
    this.sweepTimer = setInterval(() => this.sweep(), 30_000);
    this.mmTimer.unref?.(); this.sweepTimer.unref?.();
    this.stats = { started: 0, finished: 0 };
  }

  stop() {
    this.stopped = true;
    clearInterval(this.mmTimer); clearInterval(this.sweepTimer);
    for (const r of this.rooms.values()) this.clearTimers(r);
  }

  // ------------------------------------------------------------ helpers
  newCode() {
    for (;;) {
      const c = String(crypto.randomInt(100000, 999999));
      if (!this.rooms.has(c)) return c;
    }
  }

  roomOf(userId) { const c = this.userRoom.get(userId); return c ? this.rooms.get(c) : null; }

  isOnline(userId) { return (this.presence.get(userId)?.size || 0) > 0; }

  emitUser(userId, ev, data) { for (const sid of this.presence.get(userId) || []) this.io.to(sid).emit(ev, data); }

  publicRoom(r) {
    return {
      code: r.code, name: r.name, mode: r.mode, isPrivate: r.isPrivate, hostId: r.hostId, maxPlayers: r.maxPlayers, status: r.status,
      settings: r.settings, tournamentId: r.tournamentId || null, adventureStage: r.adventureStage || null, countdownAt: r.countdownAt || null,
      seats: r.seats.map((s) => ({ userId: s.userId, name: s.name, isBot: s.isBot, botLevel: s.botLevel, ready: s.ready, connected: s.isBot || s.connected,
        auto: !!s.auto, character: s.character, pawn: s.pawn, dice: s.dice, team: s.team, level: s.level || 1, left: !!s.left })),
      deadline: r.deadline || null,
      results: r.results || null,
    };
  }

  broadcast(r) {
    const payload = { room: this.publicRoom(r), game: r.game ? publicState(r.game) : null, serverTime: Date.now() };
    this.io.to(`room:${r.code}`).emit('room:state', payload);
  }

  listPublic() {
    return [...this.rooms.values()].filter((r) => !r.isPrivate && r.status === 'waiting' && !r.matchmade && r.mode !== 'adventure' && r.mode !== 'practice')
      .map((r) => ({ code: r.code, name: r.name, mode: r.mode, players: r.seats.length, maxPlayers: r.maxPlayers, host: r.seats[0]?.name }));
  }

  // ------------------------------------------------------------ room lifecycle
  async createRoom(user, opts = {}) {
    if (this.roomOf(user.id)) throw new Error('Anda masih berada di room lain. Keluar terlebih dahulu.');
    const mode = MODES.has(opts.mode) ? opts.mode : 'classic';
    const isPrivate = mode === 'practice' || mode === 'adventure' ? true : !!opts.isPrivate;
    const turnSeconds = [20, 30, 45, 60, 90].includes(Number(opts.turnSeconds)) ? Number(opts.turnSeconds) : config.turnSeconds;
    const timeLimitMin = [0, 20, 30, 45, 60, 90].includes(Number(opts.timeLimitMin)) ? Number(opts.timeLimitMin) : 0;
    const startCash = [10_000_000, 15_000_000, 20_000_000].includes(Number(opts.startCash)) ? Number(opts.startCash) : 15_000_000;
    const r = {
      code: this.newCode(),
      name: String(opts.name || `Room ${user.display_name || user.username}`).replace(/[<>]/g, '').slice(0, 30),
      mode, isPrivate,
      hostId: user.id,
      maxPlayers: mode === 'team' ? 4 : Math.min(4, Math.max(2, Number(opts.maxPlayers) || 4)),
      settings: { turnSeconds, timeLimitMin, startCash, auction: opts.auction !== false },
      seats: [],
      status: 'waiting',
      game: null,
      chat: [],
      actionCache: new Map(),
      timers: {},
      tournamentId: opts.tournamentId || null,
      adventureStage: opts.adventureStage || null,
      matchmade: !!opts.matchmade,
      createdAt: Date.now(),
    };
    r.dbId = await createRoomRow(r);
    this.rooms.set(r.code, r);
    await this.seatUser(r, user);
    r.seats[0].ready = true;
    return r;
  }

  async seatUser(r, user) {
    const prof = await one(`SELECT p.display_name, p.level, p.selected_character, p.selected_pawn, p.selected_dice FROM player_profiles p WHERE p.user_id = $1`, [user.id]);
    const teams = ['Merah', 'Biru'];
    const team = r.mode === 'team' ? teams[r.seats.filter((s) => s.team === 'Merah').length <= r.seats.filter((s) => s.team === 'Biru').length ? 0 : 1] : null;
    r.seats.push({
      userId: user.id, name: prof?.display_name || user.username, isBot: false, ready: false, connected: this.isOnline(user.id),
      character: prof?.selected_character || 'bima', pawn: prof?.selected_pawn || 'pawn_classic', dice: prof?.selected_dice || 'dice_classic',
      level: prof?.level || 1, team, timeouts: 0,
    });
    this.userRoom.set(user.id, r.code);
  }

  async joinRoom(user, code) {
    const r = this.rooms.get(String(code || '').trim());
    if (!r) throw new Error('Room tidak ditemukan. Periksa kembali kode room.');
    const existing = r.seats.find((s) => s.userId === user.id);
    if (existing) { return r; } // sudah duduk (reconnect)
    if (this.roomOf(user.id)) throw new Error('Anda masih berada di room lain.');
    if (r.status !== 'waiting') throw new Error('Permainan di room ini sudah dimulai.');
    if (r.mode === 'practice' || r.mode === 'adventure') throw new Error('Room latihan bersifat pribadi.');
    if (r.seats.length >= r.maxPlayers) throw new Error('Room sudah penuh.');
    if (r.tournamentId) {
      const e = await one(`SELECT 1 FROM tournament_entries WHERE tournament_id=$1 AND user_id=$2`, [r.tournamentId, user.id]);
      if (!e) throw new Error('Daftar turnamen terlebih dahulu.');
    }
    const blocked = await one(`SELECT 1 FROM blocks WHERE (user_id = ANY($1::uuid[]) AND blocked_id = $2) OR (user_id = $2 AND blocked_id = ANY($1::uuid[]))`,
      [r.seats.filter((s) => !s.isBot).map((s) => s.userId), user.id]);
    if (blocked) throw new Error('Anda tidak dapat bergabung ke room ini.');
    await this.seatUser(r, user);
    this.sysChat(r, `${r.seats.at(-1).name} bergabung ke room.`);
    this.broadcast(r);
    return r;
  }

  addBot(user, level = 'normal') {
    const r = this.mustHostWaiting(user);
    if (r.seats.length >= r.maxPlayers) throw new Error('Room sudah penuh.');
    const n = r.seats.filter((s) => s.isBot).length;
    const used = new Set(r.seats.map((s) => s.character));
    const ch = CHARACTERS.find((c) => !used.has(c.id)) || CHARACTERS[n % CHARACTERS.length];
    const team = r.mode === 'team' ? (r.seats.filter((s) => s.team === 'Merah').length <= r.seats.filter((s) => s.team === 'Biru').length ? 'Merah' : 'Biru') : null;
    r.seats.push({ userId: `bot-${crypto.randomUUID().slice(0, 8)}`, name: botName(r.seats.length + n), isBot: true, botLevel: BOT_LEVELS.has(level) ? level : 'normal',
      ready: true, connected: true, character: ch.id, pawn: 'pawn_classic', dice: 'dice_classic', team, level: { easy: 3, normal: 10, hard: 25 }[level] || 10 });
    this.broadcast(r);
  }

  kick(user, targetId) {
    const r = this.mustHostWaiting(user);
    if (targetId === user.id) throw new Error('Tidak dapat mengeluarkan diri sendiri.');
    const i = r.seats.findIndex((s) => s.userId === targetId);
    if (i < 0) throw new Error('Pemain tidak ditemukan.');
    const [s] = r.seats.splice(i, 1);
    if (!s.isBot) {
      this.userRoom.delete(s.userId);
      this.emitUser(s.userId, 'room:kicked', { code: r.code });
      for (const sid of this.presence.get(s.userId) || []) this.io.sockets.sockets.get(sid)?.leave(`room:${r.code}`);
    }
    this.broadcast(r);
  }

  setReady(user, ready) {
    const r = this.roomOf(user.id);
    if (!r || r.status !== 'waiting') throw new Error('Tidak berada di room yang sedang menunggu.');
    const s = r.seats.find((x) => x.userId === user.id);
    s.ready = !!ready;
    this.broadcast(r);
  }

  setTeam(user, team) {
    const r = this.roomOf(user.id);
    if (!r || r.status !== 'waiting' || r.mode !== 'team') throw new Error('Pemilihan tim hanya untuk mode Team Battle.');
    if (!['Merah', 'Biru'].includes(team)) throw new Error('Tim tidak valid.');
    const s = r.seats.find((x) => x.userId === user.id);
    if (r.seats.filter((x) => x.team === team && x !== s).length >= 2) throw new Error(`Tim ${team} sudah penuh.`);
    s.team = team;
    this.broadcast(r);
  }

  updateSettings(user, opts) {
    const r = this.mustHostWaiting(user);
    if ([20, 30, 45, 60, 90].includes(Number(opts.turnSeconds))) r.settings.turnSeconds = Number(opts.turnSeconds);
    if ([0, 20, 30, 45, 60, 90].includes(Number(opts.timeLimitMin))) r.settings.timeLimitMin = Number(opts.timeLimitMin);
    if ([10_000_000, 15_000_000, 20_000_000].includes(Number(opts.startCash))) r.settings.startCash = Number(opts.startCash);
    if (typeof opts.auction === 'boolean') r.settings.auction = opts.auction;
    if (typeof opts.isPrivate === 'boolean' && r.mode !== 'practice' && r.mode !== 'adventure') r.isPrivate = opts.isPrivate;
    if (opts.name) r.name = String(opts.name).replace(/[<>]/g, '').slice(0, 30);
    this.broadcast(r);
  }

  mustHostWaiting(user) {
    const r = this.roomOf(user.id);
    if (!r) throw new Error('Anda tidak berada di room.');
    if (r.hostId !== user.id) throw new Error('Hanya host yang dapat melakukan ini.');
    if (r.status !== 'waiting') throw new Error('Permainan sudah dimulai.');
    return r;
  }

  async start(user, { force = false } = {}) {
    const r = force ? this.roomOf(user.id) : this.mustHostWaiting(user);
    if (!r || r.status !== 'waiting') throw new Error('Room tidak dapat dimulai.');
    if (r.seats.length < 2) throw new Error('Minimal 2 pemain (tambahkan bot bila perlu).');
    const notReady = r.seats.filter((s) => !s.isBot && !s.ready);
    if (notReady.length && !force) throw new Error(`Menunggu pemain siap: ${notReady.map((s) => s.name).join(', ')}.`);
    if (r.mode === 'team') {
      if (r.seats.length !== 4) throw new Error('Team Battle membutuhkan tepat 4 pemain (2 vs 2).');
      if (r.seats.filter((s) => s.team === 'Merah').length !== 2) throw new Error('Setiap tim harus berisi 2 pemain.');
    }
    r.status = 'starting';
    const players = r.seats.map((s) => ({ id: s.userId, name: s.name, isBot: s.isBot, avatar: s.character, pawn: s.pawn, team: s.team }));
    const game = createGame({
      id: r.code, mode: r.mode === 'team' ? 'team' : 'classic',
      settings: { startCash: r.settings.startCash, auction: r.settings.auction, turnSeconds: r.settings.turnSeconds, timeLimitMin: r.settings.timeLimitMin },
    }, players, secureRng);
    if (r.mode === 'team') {
      // urutan berselang antartim: Merah, Biru, Merah, Biru
      const red = game.players.filter((p) => p.team === 'Merah'); const blue = game.players.filter((p) => p.team === 'Biru');
      game.players = [red[0], blue[0], red[1], blue[1]];
      game.log.at(-2).text = `Permainan dimulai! Urutan: ${game.players.map((p) => p.name).join(' → ')}.`;
      game.log.at(-1).text = `Giliran ${game.players[0].name}.`;
      game.log.at(-1).player = game.players[0].id;
    }
    r.game = game;
    r.sessionId = await startSession(r, game);
    r.status = 'playing';
    r.persistedSeq = 0;
    this.stats.started += 1;
    this.sysChat(r, 'Permainan dimulai! Semoga beruntung, Juragan!');
    this.afterChange(r);
    return r;
  }

  async leave(user) {
    const r = this.roomOf(user.id);
    if (!r) return;
    const s = r.seats.find((x) => x.userId === user.id);
    for (const sid of this.presence.get(user.id) || []) this.io.sockets.sockets.get(sid)?.leave(`room:${r.code}`);
    this.userRoom.delete(user.id);
    if (r.status === 'waiting') {
      r.seats = r.seats.filter((x) => x.userId !== user.id);
      if (!r.seats.some((x) => !x.isBot)) return this.closeRoom(r, 'Semua pemain keluar.');
      if (r.hostId === user.id) {
        const next = r.seats.find((x) => !x.isBot);
        r.hostId = next.userId; next.ready = true;
        this.sysChat(r, `${s.name} keluar. ${next.name} sekarang menjadi host.`);
      } else this.sysChat(r, `${s.name} keluar dari room.`);
      this.broadcast(r);
      return;
    }
    if (r.status === 'playing' && r.game) {
      s.left = true; s.auto = false;
      const p = r.game.players.find((x) => x.id === user.id);
      if (p && !p.bankrupt) {
        applyAction(r.game, user.id, { type: 'bankrupt' }, secureRng);
        this.sysChat(r, `${s.name} meninggalkan permainan dan dinyatakan bangkrut.`);
      }
      if (r.hostId === user.id) { const n = r.seats.find((x) => !x.isBot && !x.left); if (n) r.hostId = n.userId; }
      this.afterChange(r);
      if (!r.seats.some((x) => !x.isBot && !x.left) && r.status === 'playing') this.endAbandoned(r);
    }
  }

  endAbandoned(r) {
    // semua manusia keluar → selesaikan sebagai forfeit agar sesi tidak menggantung
    if (r.game && r.game.status === 'playing') applyAction(r.game, SYSTEM, { type: 'time_up' }, secureRng);
    if (r.game) r.game.endReason = 'forfeit';
    this.afterChange(r);
  }

  closeRoom(r, reason) {
    this.clearTimers(r);
    for (const s of r.seats) if (!s.isBot && this.userRoom.get(s.userId) === r.code) this.userRoom.delete(s.userId);
    this.io.to(`room:${r.code}`).emit('room:closed', { code: r.code, reason });
    this.rooms.delete(r.code);
    if (r.status !== 'finished') updateRoomStatus(r.dbId, 'closed').catch(() => {});
  }

  // ------------------------------------------------------------ socket presence
  attachSocket(socket, user) {
    if (!this.presence.has(user.id)) this.presence.set(user.id, new Set());
    this.presence.get(user.id).add(socket.id);
    const r = this.roomOf(user.id);
    if (r) {
      socket.join(`room:${r.code}`);
      const s = r.seats.find((x) => x.userId === user.id);
      if (s) {
        const wasAway = !s.connected || s.auto;
        s.connected = true; s.auto = false; s.timeouts = 0; s.disconnectedAt = null;
        if (wasAway && r.status === 'playing') this.sysChat(r, `${s.name} kembali terhubung.`);
      }
      this.afterChange(r, { skipPersist: true });
    }
  }

  detachSocket(socket, user) {
    const set = this.presence.get(user.id);
    if (set) { set.delete(socket.id); if (!set.size) this.presence.delete(user.id); }
    if (this.isOnline(user.id)) return;
    this.queue = this.queue.filter((x) => x.user.id !== user.id);
    const r = this.roomOf(user.id);
    if (!r) return;
    const s = r.seats.find((x) => x.userId === user.id);
    if (!s) return;
    s.connected = false; s.disconnectedAt = Date.now();
    if (r.status === 'waiting') {
      // di lobby room: beri 30 detik untuk reconnect sebelum dikeluarkan
      T(() => { if (!s.connected && r.status === 'waiting' && this.rooms.has(r.code)) this.leave({ id: user.id }); }, 30_000).unref?.();
    } else if (r.status === 'playing') {
      this.sysChat(r, `${s.name} terputus. Bot akan mengambil alih dalam ${config.disconnectGraceSec} detik jika tidak kembali.`);
    }
    this.broadcast(r);
    this.schedule(r);
  }

  // ------------------------------------------------------------ game actions
  handleAction(user, action, cid) {
    const r = this.roomOf(user.id);
    if (!r || r.status !== 'playing' || !r.game) return { ok: false, error: 'Tidak ada permainan aktif.' };
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') return { ok: false, error: 'Aksi tidak valid.' };
    // Aksi sistem tidak boleh dikirim klien
    if (['auction_timeout', 'time_up'].includes(action.type)) return { ok: false, error: 'Aksi tidak diizinkan.' };
    // Idempotensi: klien mengirim cid unik per aksi; pengiriman ulang (retry jaringan) tidak dieksekusi dua kali.
    let cache = r.actionCache.get(user.id);
    if (!cache) { cache = new Map(); r.actionCache.set(user.id, cache); }
    if (cid && cache.has(cid)) return { ...cache.get(cid), duplicate: true };
    const clean = sanitizeAction(action);
    const res = applyAction(r.game, user.id, clean, secureRng);
    if (cid) { cache.set(String(cid).slice(0, 64), res); if (cache.size > 200) cache.delete(cache.keys().next().value); }
    if (res.ok) {
      const s = r.seats.find((x) => x.userId === user.id);
      if (s) { s.timeouts = 0; s.auto = false; }
      this.afterChange(r);
    }
    return res;
  }

  afterChange(r, { skipPersist = false } = {}) {
    if (!this.rooms.has(r.code)) return;
    if (r.game && r.game.status === 'finished' && r.status === 'playing') {
      r.status = 'finished';
      this.clearTimers(r);
      this.broadcast(r);
      this.finish(r);
      return;
    }
    this.schedule(r);
    this.broadcast(r);
    if (!skipPersist) this.persistSoon(r);
  }

  persistSoon(r) {
    if (r.timers.persist) return;
    r.timers.persist = T(() => {
      r.timers.persist = null;
      persistProgress(r, r.game).catch((e) => console.error('[persist]', e.message));
    }, 400);
  }

  async finish(r) {
    this.stats.finished += 1;
    try {
      r.results = await finalizeMatch(r, r.game);
    } catch (e) {
      console.error('[finish]', e);
      r.results = {};
    }
    this.broadcast(r);
    for (const s of r.seats) if (!s.isBot) this.emitUser(s.userId, 'profile:changed', {});
    // bersihkan room setelah 10 menit
    if (this.stopped) return;
    r.timers.cleanup = T(() => this.closeRoom(r, 'Room ditutup.'), 10 * 60_000);
  }

  /** Keluar dari room yang sudah selesai (kembali ke lobby). */
  dismiss(user) {
    const r = this.roomOf(user.id);
    if (!r) return;
    if (r.status === 'finished') {
      this.userRoom.delete(user.id);
      for (const sid of this.presence.get(user.id) || []) this.io.sockets.sockets.get(sid)?.leave(`room:${r.code}`);
    }
  }

  clearTimers(r) {
    for (const k of Object.keys(r.timers)) { clearTimeout(r.timers[k]); r.timers[k] = null; }
  }

  /** Jadwalkan langkah otomatis: bot, timeout giliran, timeout lelang, batas waktu permainan. */
  schedule(r) {
    if (this.stopped) return;
    const g = r.game;
    if (!g || g.status !== 'playing' || r.status !== 'playing') return;
    clearTimeout(r.timers.bot); clearTimeout(r.timers.turn); clearTimeout(r.timers.trade);
    r.timers.bot = r.timers.turn = r.timers.trade = null;

    if (g.endsAt) {
      if (!r.timers.limit) r.timers.limit = T(() => { r.timers.limit = null; if (r.game.status === 'playing') { applyAction(r.game, SYSTEM, { type: 'time_up' }, secureRng); this.afterChange(r); } }, Math.max(0, g.endsAt - Date.now()));
    }

    const actors = pendingActors(g);
    const seatOf = (id) => r.seats.find((s) => s.userId === id);
    const graceOver = (s) => !s.connected && s.disconnectedAt && Date.now() - s.disconnectedAt >= config.disconnectGraceSec * 1000;
    const isAuto = (s) => s && (s.isBot || s.auto || s.left || graceOver(s));
    const autoActor = actors.find((id) => isAuto(seatOf(id)));

    // Bot merespons tawaran dagang yang ditujukan kepadanya
    const botTrade = g.trades.find((t) => t.status === 'pending' && isAuto(seatOf(t.to)));
    if (botTrade) {
      r.timers.trade = T(() => this.runAuto(r, botTrade.to), config.botDelayMs);
    }

    if (autoActor) {
      const s = seatOf(autoActor);
      if (graceOver(s) && !s.auto) { s.auto = true; this.sysChat(r, `${s.name} masih terputus — bot mengambil alih sementara.`); }
      const delay = g.phase === 'auction' ? Math.max(400, config.botDelayMs / 2) : config.botDelayMs;
      r.timers.bot = T(() => this.runAuto(r, autoActor), delay);
    }

    // Timer manusia
    let ms;
    if (g.phase === 'auction') {
      ms = Math.max(0, (g.auction.lastBidAt || Date.now()) + AUCTION_IDLE_MS - Date.now());
      r.deadline = Date.now() + ms;
      r.timers.turn = T(() => { if (r.game.phase === 'auction') { applyAction(r.game, SYSTEM, { type: 'auction_timeout' }, secureRng); this.afterChange(r); } }, ms);
      return;
    }
    const human = actors.find((id) => !isAuto(seatOf(id)));
    if (!human) { r.deadline = null; return; }
    const sec = g.phase === 'debt' ? g.settings.turnSeconds * 2 : g.settings.turnSeconds;
    // Disconnected (masih dalam grace) → tunggu hingga grace habis
    const s = seatOf(human);
    if (!s.connected && s.disconnectedAt) {
      ms = Math.max(0, s.disconnectedAt + config.disconnectGraceSec * 1000 - Date.now()) + 50;
      r.deadline = Date.now() + ms;
      r.timers.turn = T(() => this.schedule(r), ms);
      return;
    }
    const key = `${g.phase}:${g.turnCount}:${human}:${g.debts.length}`;
    if (r.deadlineKey !== key) { r.deadlineKey = key; r.deadline = Date.now() + sec * 1000; }
    ms = Math.max(0, r.deadline - Date.now());
    r.timers.turn = T(() => {
      const st = seatOf(human);
      if (st) {
        st.timeouts = (st.timeouts || 0) + 1;
        if (st.timeouts >= 3 && !st.auto) { st.auto = true; this.sysChat(r, `${st.name} tidak aktif — mode otomatis diaktifkan sampai ia bertindak lagi.`); }
      }
      this.runAuto(r, human, true);
    }, ms);
  }

  runAuto(r, pid, timeout = false) {
    const g = r.game;
    if (!g || g.status !== 'playing' || !this.rooms.has(r.code)) return;
    const s = r.seats.find((x) => x.userId === pid);
    const level = s?.isBot ? s.botLevel : 'normal';
    let a = chooseBotAction(g, pid, level, secureRng);
    if (!a) { this.schedule(r); return; }
    // Saat timeout untuk manusia: jangan belanja agresif atas nama pemain — tolak beli, lewati lelang.
    if (timeout && !s?.auto) {
      if (a.type === 'buy') a = { type: 'decline' };
      if (a.type === 'bid') a = { type: 'pass_auction' };
      if (a.type === 'build' || a.type === 'unmortgage') a = { type: g.phase === 'roll' ? 'roll' : 'end_turn' };
    }
    let res = applyAction(g, pid, a, secureRng);
    if (!res.ok) {
      const fb = g.phase === 'auction' ? { type: 'pass_auction' } : g.phase === 'debt' ? { type: 'bankrupt' } : g.phase === 'buy' ? { type: 'decline' } : g.phase === 'end' ? { type: 'end_turn' } : { type: 'roll' };
      res = applyAction(g, pid, fb, secureRng);
      if (!res.ok) console.warn('[auto] gagal', a, res.error);
    }
    this.afterChange(r);
  }

  /** Pemain mengaktifkan/menonaktifkan mode otomatis (bot memainkan gilirannya). */
  setAuto(user, on) {
    const r = this.roomOf(user.id);
    if (!r || r.status !== 'playing') throw new Error('Tidak ada permainan aktif.');
    const s = r.seats.find((x) => x.userId === user.id);
    if (!s) throw new Error('Tidak duduk di room ini.');
    s.auto = !!on; s.timeouts = 0;
    this.sysChat(r, `${s.name} ${s.auto ? 'mengaktifkan' : 'mematikan'} mode otomatis.`);
    this.afterChange(r, { skipPersist: true });
  }

  // ------------------------------------------------------------ chat
  sysChat(r, text) {
    const m = { id: crypto.randomUUID(), system: true, text, at: Date.now() };
    r.chat.push(m); if (r.chat.length > 100) r.chat.shift();
    this.io.to(`room:${r.code}`).emit('chat:message', m);
  }

  async chat(user, rawText, channel = 'room') {
    const r = this.roomOf(user.id);
    if (!r) throw new Error('Tidak berada di room.');
    if (user.muted_until && new Date(user.muted_until) > new Date()) throw new Error('Anda sedang dibisukan oleh moderator.');
    const { text, flagged } = moderate(rawText);
    if (!text) return;
    if (!this.spam.check(user.id, text)) throw new Error('Jangan mengirim pesan yang sama berulang-ulang.');
    const s = r.seats.find((x) => x.userId === user.id);
    const isTeam = channel === 'team' && r.mode === 'team';
    const m = { id: crypto.randomUUID(), userId: user.id, name: s?.name || user.username, text, at: Date.now(), team: isTeam ? s?.team : null };
    if (isTeam) {
      for (const t of r.seats.filter((x) => x.team === s.team && !x.isBot)) this.emitUser(t.userId, 'chat:message', m);
    } else {
      r.chat.push(m); if (r.chat.length > 100) r.chat.shift();
      this.io.to(`room:${r.code}`).emit('chat:message', m);
    }
    q(`INSERT INTO chat_messages(channel,channel_id,sender_id,sender_name,body,flagged) VALUES ('room',$1,$2,$3,$4,$5)`, [r.code, user.id, m.name, text, flagged]).catch(() => {});
  }

  emote(user, emoteId) {
    const r = this.roomOf(user.id);
    if (!r) return;
    this.io.to(`room:${r.code}`).emit('room:emote', { userId: user.id, emote: String(emoteId).slice(0, 40), at: Date.now() });
  }

  // ------------------------------------------------------------ matchmaking
  joinQueue(user, mode = 'classic', tournamentId = null) {
    if (this.roomOf(user.id)) throw new Error('Keluar dari room terlebih dahulu.');
    this.queue = this.queue.filter((x) => x.user.id !== user.id);
    this.queue.push({ user, mode: mode === 'tournament' ? 'tournament' : 'classic', tournamentId, at: Date.now() });
    this.emitUser(user.id, 'mm:status', { queued: true, mode, position: this.queue.length });
  }

  leaveQueue(user) {
    this.queue = this.queue.filter((x) => x.user.id !== user.id);
    this.emitUser(user.id, 'mm:status', { queued: false });
  }

  async tickMatchmaking() {
    const wait = config.matchmakingWaitSec * 1000;
    const groups = new Map();
    for (const e of this.queue) {
      const k = `${e.mode}:${e.tournamentId || ''}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.at - b.at);
      while (list.length) {
        const oldest = Date.now() - list[0].at;
        let take;
        if (list.length >= 4) take = list.splice(0, 4);
        else if (list.length >= 2 && oldest >= wait) take = list.splice(0, list.length);
        else if (oldest >= wait * 1.5) take = list.splice(0, list.length);
        else break;
        await this.createMatch(take);
      }
    }
  }

  async createMatch(entries) {
    const ids = new Set(entries.map((e) => e.user.id));
    this.queue = this.queue.filter((x) => !ids.has(x.user.id));
    const first = entries[0];
    let r;
    try {
      r = await this.createRoom(first.user, { mode: first.mode, name: first.mode === 'tournament' ? 'Pertandingan Turnamen' : 'Quick Play', matchmade: true, tournamentId: first.tournamentId, turnSeconds: 30 });
      for (const e of entries.slice(1)) { await this.seatUser(r, e.user); }
      for (const s of r.seats) s.ready = true;
      const bots = Math.max(0, (entries.length === 1 ? 3 : 0));
      for (let k = 0; k < bots; k++) this.addBot(first.user, k === 0 ? 'hard' : 'normal');
    } catch (e) {
      console.error('[mm] gagal membuat room', e);
      for (const en of entries) this.emitUser(en.user.id, 'mm:status', { queued: false, error: 'Gagal membuat pertandingan, coba lagi.' });
      return;
    }
    for (const e of entries) {
      for (const sid of this.presence.get(e.user.id) || []) this.io.sockets.sockets.get(sid)?.join(`room:${r.code}`);
      this.emitUser(e.user.id, 'mm:matched', { code: r.code });
    }
    r.countdownAt = Date.now() + 4000;
    this.broadcast(r);
    r.timers.countdown = T(() => this.start({ id: r.hostId }, { force: true }).catch((e) => console.error('[mm] start', e.message)), 4000);
  }

  // ------------------------------------------------------------ pemulihan setelah restart
  async restore() {
    const rows = await loadActiveSessions();
    let n = 0;
    for (const row of rows) {
      const snap = row.state;
      if (!snap?.game || !snap?.room || snap.game.status !== 'playing') { await abortSession(row.id); continue; }
      const rm = snap.room;
      if (this.rooms.has(rm.code)) { await abortSession(row.id); continue; }
      const r = {
        code: rm.code, name: rm.name, mode: rm.mode, isPrivate: rm.isPrivate, hostId: rm.hostId, maxPlayers: rm.maxPlayers, settings: rm.settings,
        tournamentId: rm.tournamentId, adventureStage: rm.adventureStage,
        seats: rm.seats.map((s) => ({ ...s, ready: true, connected: s.isBot, disconnectedAt: s.isBot ? null : Date.now(), timeouts: 0, left: false })),
        status: 'playing', game: snap.game, chat: [], actionCache: new Map(), timers: {}, dbId: row.room_id, sessionId: row.id,
        persistedSeq: snap.game.seq, persistedTx: snap.game.txSeq, restored: true, createdAt: Date.now(),
      };
      // pemain yang sudah bangkrut/keluar tidak perlu di-bind lagi
      for (const s of r.seats) {
        const p = r.game.players.find((x) => x.id === s.userId);
        if (!s.isBot && p && !p.bankrupt) this.userRoom.set(s.userId, r.code);
      }
      r.game.turnStartedAt = Date.now();
      this.rooms.set(r.code, r);
      this.sysChat(r, 'Server dipulihkan. Permainan dilanjutkan dari kondisi terakhir.');
      this.schedule(r);
      n += 1;
    }
    return n;
  }

  sweep() {
    // tutup room menunggu yang terlalu lama kosong / tidak aktif
    for (const r of this.rooms.values()) {
      if (r.status === 'waiting' && Date.now() - r.createdAt > 2 * 3600_000) this.closeRoom(r, 'Room kedaluwarsa.');
    }
  }

  /** Ringkasan untuk admin. */
  adminList() {
    return [...this.rooms.values()].map((r) => ({
      ...this.publicRoom(r), createdAt: r.createdAt, sessionId: r.sessionId || null,
      round: r.game?.round || 0, phase: r.game?.phase || null, turnOf: r.game ? r.game.players[r.game.turn]?.name : null,
      players: r.game ? r.game.players.map((p) => ({ name: p.name, cash: p.cash, bankrupt: p.bankrupt, isBot: p.isBot })) : null,
    }));
  }

  adminClose(code, reason = 'Ditutup oleh admin.') {
    const r = this.rooms.get(code);
    if (!r) throw new Error('Room tidak ditemukan.');
    if (r.status === 'playing' && r.game) {
      applyAction(r.game, SYSTEM, { type: 'time_up' }, secureRng);
      r.game.endReason = 'admin';
      this.afterChange(r);
      this.sysChat(r, reason);
      return;
    }
    this.closeRoom(r, reason);
  }
}

/** Saring field aksi agar hanya field yang dikenal yang diteruskan ke engine. */
function sanitizeAction(a) {
  const out = { type: String(a.type).slice(0, 32) };
  if (a.tile !== undefined) out.tile = Number(a.tile);
  if (a.amount !== undefined) out.amount = Number(a.amount);
  if (a.to !== undefined) out.to = String(a.to).slice(0, 64);
  if (a.id !== undefined) out.id = Number(a.id);
  if (a.accept !== undefined) out.accept = a.accept === true;
  if (a.cancel !== undefined) out.cancel = a.cancel === true;
  for (const k of ['offer', 'request']) {
    if (a[k] && typeof a[k] === 'object') out[k] = { cash: Number(a[k].cash) || 0, tiles: Array.isArray(a[k].tiles) ? a[k].tiles.slice(0, 28).map(Number) : [], jailCards: Number(a[k].jailCards) || 0 };
  }
  return out;
}
