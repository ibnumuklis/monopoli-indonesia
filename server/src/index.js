// Monopoli Indonesia — server utama (HTTP REST + Socket.IO real-time, server-authoritative).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { config, isProd } from './config.js';
import { initDb, q, one, db, closeDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { userFromToken, ensureSuperAdmin } from './auth.js';
import { RoomManager } from './game/rooms.js';
import { RateLimiter, SpamGuard } from './game/moderation.js';
import { playerRoutes } from './routes/player.js';
import { socialRoutes } from './routes/social.js';
import { adminRoutes } from './routes/admin.js';
import { loadContentOverrides, boardPayload } from './services/content.js';
import { persistProgress } from './services/matches.js';

export async function createServer({ port = config.port, silent = false } = {}) {
  const log = silent ? () => {} : console.log;
  await initDb();
  await migrate({ log });
  await loadContentOverrides();
  try { await ensureSuperAdmin(); }
  catch (e) { console.error('[admin] akun admin gagal dibuat — ADMIN_USERNAME hanya boleh huruf, angka, _ atau . (3-20 karakter):', e.message); }

  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const corsOrigin = config.allowedOrigins.length ? config.allowedOrigins : (isProd ? false : true);
  const io = new Server(server, { cors: { origin: corsOrigin, credentials: true }, maxHttpBufferSize: 16 * 1024, pingInterval: 10_000, pingTimeout: 8_000 });

  const limiter = new RateLimiter(10, 1); // umum: burst 10, isi ulang 1/detik
  const actionLimiter = new RateLimiter(config.actionRate * 2, config.actionRate); // aksi permainan
  const chatLimiter = new RateLimiter(5, 0.5);
  const spam = new SpamGuard();
  const rooms = new RoomManager(io);

  // ---------------------------------------------------------- HTTP middleware
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
      `connect-src 'self' ws: wss: ${config.supabaseUrl || ''}`.trim(), "font-src 'self' data:", "media-src 'self' blob: data:", "frame-ancestors 'none'",
    ].join('; '));
    const origin = req.headers.origin;
    if (origin && (corsOrigin === true || (Array.isArray(corsOrigin) && corsOrigin.includes(origin)))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  const apiLimiter = new RateLimiter(config.apiRate * 6, config.apiRate);
  app.use('/api', (req, res, next) => (apiLimiter.take(`api:${req.ip}`) ? next() : res.status(429).json({ error: 'Terlalu banyak permintaan.' })));

  app.get('/health', async (req, res) => {
    let dbOk = true;
    try { await one('SELECT 1 AS ok'); } catch { dbOk = false; }
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, service: 'monopoli-indonesia', db: db().kind, rooms: rooms.rooms.size, online: rooms.presence.size, uptime: Math.round(process.uptime()) });
  });
  app.get('/api/board', (req, res) => res.json(boardPayload()));
  app.get('/api/status', async (req, res) => {
    const s = await one(`SELECT (SELECT value FROM system_settings WHERE key='maintenance') AS maintenance, (SELECT value FROM system_settings WHERE key='motd') AS motd`);
    res.json({ maintenance: s.maintenance, motd: s.motd, online: rooms.presence.size });
  });
  app.use('/api', playerRoutes({ limiter, rooms }));
  app.use('/api', socialRoutes({ rooms, limiter, spam }));
  app.use('/api/admin', adminRoutes({ rooms }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

  // Klien hasil build (Vite)
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: isProd ? '7d' : 0, setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get('/admin*', (req, res) => res.sendFile(path.join(config.clientDist, 'admin.html')));
    app.get('*', (req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  } else {
    app.get('/', (req, res) => res.type('text').send('Monopoli Indonesia server berjalan. Build klien dengan `npm run build` atau jalankan `npm run dev:client`.'));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error('[http]', err);
    res.status(status).json({ error: status >= 500 ? 'Terjadi kesalahan server.' : err.message });
  });

  // ---------------------------------------------------------- Socket.IO
  io.use(async (socket, next) => {
    try {
      const u = await userFromToken(socket.handshake.auth?.token);
      if (!u) return next(new Error('unauthorized'));
      if (u.is_banned) return next(new Error('banned'));
      socket.data.user = u;
      next();
    } catch (e) { next(e); }
  });

  const maintenanceOn = async () => (await one(`SELECT value FROM system_settings WHERE key='maintenance'`))?.value?.enabled;

  io.on('connection', (socket) => {
    const user = socket.data.user;
    rooms.attachSocket(socket, user);
    q(`UPDATE users SET last_seen_at = now() WHERE id=$1`, [user.id]).catch(() => {});

    // Pembungkus handler: validasi ack, rate limit, error → pesan ramah
    const on = (ev, fn, { lim = limiter, cost = 1 } = {}) => socket.on(ev, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!lim.take(`${ev}:${user.id}`, cost)) return reply({ ok: false, error: 'Terlalu banyak permintaan. Pelan-pelan ya.' });
      try {
        const out = await fn(payload && typeof payload === 'object' ? payload : {});
        reply({ ok: true, ...(out || {}) });
      } catch (e) {
        reply({ ok: false, error: e.message || 'Gagal.' });
      }
    });
    const sync = () => {
      const r = rooms.roomOf(user.id);
      if (r) { socket.join(`room:${r.code}`); rooms.broadcast(r); }
      return { code: r?.code || null };
    };
    const freshUser = async () => ({ ...user, ...(await one(`SELECT muted_until FROM users WHERE id=$1`, [user.id])) });

    on('room:create', async (p) => {
      if (await maintenanceOn() && !user.admin_role) throw new Error('Server sedang dalam pemeliharaan.');
      if (p.mode === 'practice' || p.mode === 'adventure') throw new Error('Gunakan menu Practice / Adventure.');
      if (p.mode === 'tournament') throw new Error('Pertandingan turnamen menggunakan matchmaking.');
      const r = await rooms.createRoom(user, p);
      socket.join(`room:${r.code}`); rooms.broadcast(r);
      return { code: r.code };
    });
    on('room:join', async (p) => {
      if (await maintenanceOn() && !user.admin_role) throw new Error('Server sedang dalam pemeliharaan.');
      const r = await rooms.joinRoom(user, p.code);
      socket.join(`room:${r.code}`); rooms.broadcast(r);
      return { code: r.code };
    });
    on('room:list', async () => ({ rooms: rooms.listPublic() }));
    on('room:sync', async () => sync());
    on('room:leave', async () => { await rooms.leave(user); return {}; });
    on('room:dismiss', async () => { rooms.dismiss(user); return {}; });
    on('room:ready', async (p) => rooms.setReady(user, p.ready));
    on('room:team', async (p) => rooms.setTeam(user, p.team));
    on('room:settings', async (p) => rooms.updateSettings(user, p));
    on('room:addBot', async (p) => rooms.addBot(user, p.level));
    on('room:kick', async (p) => rooms.kick(user, p.userId));
    on('room:start', async () => { await rooms.start(user); });
    on('room:invite', async (p) => {
      const r = rooms.roomOf(user.id);
      if (!r || r.status !== 'waiting') throw new Error('Buat atau masuk room terlebih dahulu.');
      const fr = await one(`SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))`, [user.id, String(p.userId)]);
      if (!fr) throw new Error('Hanya teman yang dapat diundang.');
      await q(`INSERT INTO inbox_messages(user_id,kind,title,body,data) VALUES ($1,'invite',$2,$3,$4)`, [p.userId, 'Undangan bermain', `${user.display_name} mengundangmu ke room "${r.name}" (kode ${r.code}).`, { code: r.code }]);
      rooms.emitUser(p.userId, 'room:invited', { code: r.code, from: user.display_name, name: r.name });
    }, { cost: 2 });

    on('practice:start', async (p) => {
      const bots = Math.max(1, Math.min(3, Number(p.bots) || 3));
      const r = await rooms.createRoom(user, { mode: 'practice', name: 'Latihan', turnSeconds: 90, startCash: p.startCash });
      socket.join(`room:${r.code}`);
      const levels = ['easy', 'normal', 'hard'].includes(p.level) ? p.level : 'normal';
      for (let k = 0; k < bots; k++) rooms.addBot(user, levels);
      await rooms.start(user);
      return { code: r.code };
    });
    on('adventure:start', async (p) => {
      const stage = await one(`SELECT * FROM adventure_stages WHERE id=$1`, [String(p.stageId)]);
      if (!stage) throw new Error('Stage tidak ditemukan.');
      const prev = await one(`SELECT s.id FROM adventure_stages s WHERE s.sort_order < $1 ORDER BY s.sort_order DESC LIMIT 1`, [stage.sort_order]);
      if (prev && !(await one(`SELECT 1 FROM adventure_progress WHERE user_id=$1 AND stage_id=$2 AND completed_at IS NOT NULL`, [user.id, prev.id]))) throw new Error('Selesaikan stage sebelumnya terlebih dahulu.');
      const r = await rooms.createRoom(user, { mode: 'adventure', name: `Adventure: ${stage.title}`, adventureStage: stage.id, turnSeconds: 90 });
      socket.join(`room:${r.code}`);
      for (let k = 0; k < stage.bots; k++) rooms.addBot(user, stage.bot_level);
      await rooms.start(user);
      return { code: r.code };
    });

    on('game:action', async (p) => {
      const res = rooms.handleAction(user, p.action, p.cid);
      if (!res.ok) throw new Error(res.error);
      return {};
    }, { lim: actionLimiter });

    on('game:auto', async (p) => rooms.setAuto(user, p.on));
    on('chat:send', async (p) => { await rooms.chat(await freshUser(), p.text, p.channel); }, { lim: chatLimiter });
    on('emote', async (p) => rooms.emote(user, p.id), { lim: chatLimiter });

    on('mm:join', async (p) => {
      if (await maintenanceOn() && !user.admin_role) throw new Error('Server sedang dalam pemeliharaan.');
      let tid = null;
      if (p.mode === 'tournament') {
        const t = await one(`SELECT t.id FROM tournaments t JOIN tournament_entries e ON e.tournament_id=t.id AND e.user_id=$2 WHERE t.id::text=$1 AND t.status='open' AND t.ends_at > now()`, [String(p.tournamentId || ''), user.id]);
        if (!t) throw new Error('Daftar ke turnamen yang sedang dibuka terlebih dahulu.');
        tid = t.id;
      }
      rooms.joinQueue(user, p.mode, tid);
    });
    on('mm:leave', async () => rooms.leaveQueue(user));

    socket.on('disconnect', () => {
      rooms.detachSocket(socket, user);
      q(`UPDATE users SET last_seen_at = now() WHERE id=$1`, [user.id]).catch(() => {});
    });
  });

  const restored = await rooms.restore();
  if (restored) log(`[server] ${restored} permainan dipulihkan dari database.`);

  await new Promise((res) => server.listen(port, config.host, res));
  const addr = server.address();
  log(`[server] Monopoli Indonesia berjalan di http://localhost:${addr.port} (db: ${db().kind})`);

  return {
    app, io, server, rooms, port: addr.port,
    async close() {
      rooms.stop();
      io.close();
      server.closeAllConnections?.();
      await new Promise((r) => server.close(() => r()));
    },
  };
}

if (process.argv[1] && process.argv[1].endsWith(path.join('server', 'src', 'index.js'))) {
  const ready = createServer().catch((e) => { console.error(e); process.exit(1); });
  const shutdown = async () => {
    console.log('[server] berhenti... menyimpan state permainan');
    const s = await ready;
    try { for (const r of s.rooms.rooms.values()) if (r.game && r.status === 'playing') await persistProgress(r, r.game).catch(() => {}); } finally {
      await s.close().catch(() => {}); await closeDb().catch(() => {}); process.exit(0);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
