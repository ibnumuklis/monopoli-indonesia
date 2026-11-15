// Admin Dashboard API dengan Role-Based Access Control + audit log.
// Role: super_admin > admin > moderator > support.
import express from 'express';
import { q, one, many, tx } from '../db/index.js';
import { requireAuth, requireAdmin, HttpError, createUser } from '../auth.js';
import { adjustWallet } from '../services/economy.js';
import { loadContentOverrides } from '../services/content.js';
import { wrap } from './player.js';

const ALL = ['super_admin', 'admin', 'moderator', 'support'];
const MOD = ['super_admin', 'admin', 'moderator'];
const ADM = ['super_admin', 'admin'];
const SUPER = ['super_admin'];

export function adminRoutes({ rooms }) {
  const r = express.Router();
  r.use(requireAuth, requireAdmin());

  const audit = (req, action, targetType, targetId, detail = {}) =>
    q(`INSERT INTO admin_audit_logs(admin_user_id,admin_name,role,action,target_type,target_id,detail,ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.id, req.user.username, req.user.admin_role, action, targetType, targetId == null ? null : String(targetId), detail, req.ip]);

  r.get('/me', (req, res) => res.json({ id: req.user.id, username: req.user.username, role: req.user.admin_role }));

  // ---------------------------------------------------------- dashboard & analytics
  r.get('/dashboard', requireAdmin(...ALL), wrap(async (req, res) => {
    const [users, matches, avg, modes, growth, activity, tx7, retention, reportsOpen] = await Promise.all([
      one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS new_today, count(*) FILTER (WHERE last_login_at > now() - interval '1 day')::int AS dau FROM users`),
      one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE started_at > now() - interval '1 day')::int AS today FROM game_sessions WHERE status='finished'`),
      one(`SELECT COALESCE(round(avg(duration_sec)),0)::int AS avg_sec, COALESCE(round(avg(rounds)),0)::int AS avg_rounds FROM game_sessions WHERE status='finished'`),
      many(`SELECT mode, count(*)::int AS n FROM game_sessions GROUP BY mode ORDER BY n DESC`),
      many(`SELECT to_char(d, 'YYYY-MM-DD') AS day, (SELECT count(*) FROM users u WHERE u.created_at::date = d)::int AS signups, (SELECT count(*) FROM users u WHERE u.created_at::date <= d)::int AS total
              FROM generate_series((now() - interval '13 days')::date, now()::date, interval '1 day') d`),
      many(`SELECT to_char(d, 'YYYY-MM-DD') AS day, (SELECT count(*) FROM game_sessions s WHERE s.started_at::date = d)::int AS matches
              FROM generate_series((now() - interval '13 days')::date, now()::date, interval '1 day') d`),
      many(`SELECT currency, sum(amount) FILTER (WHERE amount > 0)::bigint AS earned, -sum(amount) FILTER (WHERE amount < 0)::bigint AS spent, count(*)::int AS n
              FROM wallet_transactions WHERE created_at > now() - interval '7 days' AND currency IN ('coins','diamonds','tickets') GROUP BY currency`),
      one(`SELECT count(*) FILTER (WHERE created_at < now() - interval '1 day')::int AS cohort,
                  count(*) FILTER (WHERE created_at < now() - interval '1 day' AND last_login_at > created_at + interval '1 day')::int AS d1,
                  count(*) FILTER (WHERE created_at < now() - interval '7 days')::int AS cohort7,
                  count(*) FILTER (WHERE created_at < now() - interval '7 days' AND last_login_at > created_at + interval '7 days')::int AS d7 FROM users`),
      one(`SELECT count(*)::int AS n FROM player_reports WHERE status='open'`),
    ]);
    const live = rooms.adminList();
    res.json({
      users: { ...users, online: rooms.presence.size }, matches, avg, modes, growth, activity, economy7d: tx7, reportsOpen: reportsOpen.n,
      retention: { d1: retention.cohort ? Math.round((retention.d1 / retention.cohort) * 100) : 0, d7: retention.cohort7 ? Math.round((retention.d7 / retention.cohort7) * 100) : 0 },
      rooms: { active: live.filter((x) => x.status === 'playing').length, waiting: live.filter((x) => x.status === 'waiting').length, queue: rooms.queue.length },
    });
  }));

  // ---------------------------------------------------------- player management
  r.get('/players', requireAdmin(...ALL), wrap(async (req, res) => {
    const term = String(req.query.q || '').slice(0, 40).replace(/[\\%_]/g, '\\$&');
    res.json(await many(`SELECT u.id, u.username, u.email, u.auth_provider, u.is_banned, u.ban_reason, u.muted_until, u.created_at, u.last_login_at,
                                p.display_name, p.level, p.rank_points, p.games_played, p.wins, w.coins, w.diamonds, w.tickets, a.role AS admin_role
                           FROM users u JOIN player_profiles p ON p.user_id=u.id JOIN player_wallets w ON w.user_id=u.id LEFT JOIN admin_users a ON a.user_id=u.id
                          WHERE ($1 = '' OR u.username ILIKE '%'||$1||'%' OR p.display_name ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%')
                          ORDER BY u.created_at DESC LIMIT 100`, [term]));
  }));
  r.get('/players/:id', requireAdmin(...ALL), wrap(async (req, res) => {
    const u = await one(`SELECT u.*, p.*, w.coins, w.diamonds, w.tickets FROM users u JOIN player_profiles p ON p.user_id=u.id JOIN player_wallets w ON w.user_id=u.id WHERE u.id::text=$1`, [req.params.id]);
    if (!u) throw new HttpError(404, 'Tidak ditemukan.');
    delete u.password_hash;
    const txs = await many(`SELECT * FROM wallet_transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 50`, [u.user_id]);
    const reports = await many(`SELECT * FROM player_reports WHERE target_id=$1 ORDER BY id DESC LIMIT 20`, [u.user_id]);
    const chats = await many(`SELECT channel, channel_id, body, flagged, created_at FROM chat_messages WHERE sender_id=$1 ORDER BY id DESC LIMIT 30`, [u.user_id]);
    res.json({ user: u, transactions: txs, reports, chats, online: rooms.isOnline(u.user_id) });
  }));
  r.post('/players/:id/ban', requireAdmin(...MOD), wrap(async (req, res) => {
    const ban = req.body?.ban !== false;
    const target = await one(`SELECT a.role FROM admin_users a WHERE a.user_id::text=$1`, [req.params.id]);
    if (target && req.user.admin_role !== 'super_admin') throw new HttpError(403, 'Tidak dapat memblokir admin.');
    await q(`UPDATE users SET is_banned=$2, ban_reason=$3 WHERE id::text=$1`, [req.params.id, ban, ban ? String(req.body?.reason || 'Pelanggaran aturan').slice(0, 200) : null]);
    if (ban) await q(`UPDATE sessions SET revoked=true WHERE user_id::text=$1`, [req.params.id]);
    await audit(req, ban ? 'player.ban' : 'player.unban', 'user', req.params.id, { reason: req.body?.reason });
    if (ban) rooms.emitUser(req.params.id, 'account:banned', {});
    res.json({ ok: true });
  }));
  r.post('/players/:id/mute', requireAdmin(...MOD), wrap(async (req, res) => {
    const minutes = Math.max(0, Math.min(60 * 24 * 30, Number(req.body?.minutes) || 0));
    await q(`UPDATE users SET muted_until = CASE WHEN $2 = 0 THEN NULL ELSE now() + ($2 || ' minutes')::interval END WHERE id::text=$1`, [req.params.id, String(minutes)]);
    await audit(req, 'player.mute', 'user', req.params.id, { minutes });
    res.json({ ok: true });
  }));
  r.post('/players/:id/wallet', requireAdmin(...ADM), wrap(async (req, res) => {
    const { currency, amount, reason } = req.body || {};
    if (!reason || String(reason).length < 4) throw new HttpError(400, 'Alasan penyesuaian wajib diisi.');
    const n = Math.trunc(Number(amount));
    if (!n || Math.abs(n) > 1_000_000) throw new HttpError(400, 'Jumlah tidak valid.');
    const out = await tx((c) => adjustWallet(c, req.params.id, currency, n, `Admin: ${String(reason).slice(0, 100)}`, req.user.id));
    await audit(req, 'player.wallet_adjust', 'user', req.params.id, { currency, amount: n, reason });
    rooms.emitUser(req.params.id, 'profile:changed', {});
    res.json(out);
  }));
  r.post('/players/:id/role', requireAdmin(...SUPER), wrap(async (req, res) => {
    const role = req.body?.role;
    if (role === null || role === '') await q(`DELETE FROM admin_users WHERE user_id::text=$1`, [req.params.id]);
    else if (['super_admin', 'admin', 'moderator', 'support'].includes(role)) await q(`INSERT INTO admin_users(user_id,role) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET role=$2`, [req.params.id, role]);
    else throw new HttpError(400, 'Role tidak valid.');
    await audit(req, 'admin.role', 'user', req.params.id, { role });
    res.json({ ok: true });
  }));
  r.post('/admins', requireAdmin(...SUPER), wrap(async (req, res) => {
    const { username, password, role } = req.body || {};
    if (!['admin', 'moderator', 'support'].includes(role)) throw new HttpError(400, 'Role tidak valid.');
    const u = await createUser({ username, password, displayName: username });
    await q(`INSERT INTO admin_users(user_id,role) VALUES ($1,$2)`, [u.id, role]);
    await audit(req, 'admin.create', 'user', u.id, { username, role });
    res.json({ id: u.id });
  }));

  // ---------------------------------------------------------- room & game monitoring
  r.get('/rooms', requireAdmin(...ALL), wrap(async (req, res) => {
    const history = await many(`SELECT s.id, s.mode, s.status, s.started_at, s.finished_at, s.duration_sec, s.rounds, s.end_reason, r.code, r.name,
                                       (SELECT string_agg(display_name || CASE WHEN is_bot THEN ' (bot)' ELSE '' END, ', ' ORDER BY seat) FROM game_players gp WHERE gp.session_id=s.id) AS players
                                  FROM game_sessions s JOIN game_rooms r ON r.id=s.room_id ORDER BY s.started_at DESC LIMIT 50`);
    res.json({ live: rooms.adminList(), history, queue: rooms.queue.map((x) => ({ user: x.user.username, mode: x.mode, waitingSec: Math.round((Date.now() - x.at) / 1000) })) });
  }));
  r.get('/sessions/:id', requireAdmin(...ALL), wrap(async (req, res) => {
    const s = await one(`SELECT id, mode, status, started_at, finished_at, end_reason, rounds, duration_sec FROM game_sessions WHERE id::text=$1`, [req.params.id]);
    if (!s) throw new HttpError(404, 'Tidak ditemukan.');
    const [players, events, dice, txs] = await Promise.all([
      many(`SELECT * FROM game_players WHERE session_id=$1 ORDER BY seat`, [s.id]),
      many(`SELECT seq, type, text, created_at FROM game_events WHERE session_id=$1 ORDER BY seq DESC LIMIT 200`, [s.id]),
      many(`SELECT d1, d2, player_ref, round, created_at FROM dice_rolls WHERE session_id=$1 ORDER BY id`, [s.id]),
      many(`SELECT seq, from_ref, to_ref, amount, reason FROM game_transactions WHERE session_id=$1 ORDER BY seq DESC LIMIT 200`, [s.id]),
    ]);
    // statistik distribusi dadu (deteksi anomali)
    const dist = Array(13).fill(0);
    for (const d of dice) dist[d.d1 + d.d2] += 1;
    res.json({ session: s, players, events, diceCount: dice.length, diceDistribution: dist.slice(2), transactions: txs });
  }));
  r.post('/rooms/:code/close', requireAdmin(...MOD), wrap(async (req, res) => {
    rooms.adminClose(req.params.code, `Room ditutup oleh admin${req.body?.reason ? `: ${String(req.body.reason).slice(0, 100)}` : '.'}`);
    await audit(req, 'room.close', 'room', req.params.code, { reason: req.body?.reason });
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------- konten: properti & kartu
  r.get('/properties', requireAdmin(...ALL), wrap(async (req, res) => {
    res.json({ groups: await many(`SELECT * FROM property_groups ORDER BY house_price, id`), properties: await many(`SELECT * FROM properties ORDER BY id`) });
  }));
  r.patch('/properties/:id', requireAdmin(...ADM), wrap(async (req, res) => {
    const { name, landmark, region, price, rent } = req.body || {};
    const p = await one(`SELECT * FROM properties WHERE id=$1`, [Number(req.params.id)]);
    if (!p) throw new HttpError(404, 'Tidak ditemukan.');
    if (price !== undefined && (!p.price || !(Number(price) >= 10000 && Number(price) <= 100_000_000))) throw new HttpError(400, 'Harga tidak valid.');
    if (rent !== undefined && (!Array.isArray(rent) || rent.length !== 6 || rent.some((v, i) => !(Number(v) > 0) || (i && Number(v) <= Number(rent[i - 1]))))) throw new HttpError(400, 'Sewa harus 6 angka naik bertahap.');
    await q(`UPDATE properties SET name=COALESCE($2,name), landmark=COALESCE($3,landmark), region=COALESCE($4,region), price=COALESCE($5,price), mortgage=COALESCE($5/2,mortgage), rent=COALESCE($6,rent), updated_at=now() WHERE id=$1`,
      [p.id, name ? String(name).slice(0, 30) : null, landmark ? String(landmark).slice(0, 40) : null, region ? String(region).slice(0, 40) : null, price !== undefined ? Math.round(Number(price)) : null, rent ? rent.map((v) => Math.round(Number(v))) : null]);
    await loadContentOverrides({ full: false });
    await audit(req, 'property.update', 'property', p.id, req.body);
    res.json({ ok: true, note: 'Nama & landmark langsung berlaku. Perubahan harga/sewa berlaku setelah server dimulai ulang (agar permainan berjalan tidak berubah aturan).' });
  }));
  r.get('/cards', requireAdmin(...ALL), wrap(async (req, res) => res.json(await many(`SELECT * FROM game_cards ORDER BY deck_id, id`))));
  r.patch('/cards/:id', requireAdmin(...ADM), wrap(async (req, res) => {
    const { title, body, amount } = req.body || {};
    const c = await one(`SELECT * FROM game_cards WHERE id=$1`, [req.params.id]);
    if (!c) throw new HttpError(404, 'Tidak ditemukan.');
    const effect = { ...c.effect };
    if (amount !== undefined && 'amount' in effect) {
      const n = Math.round(Number(amount));
      if (!Number.isFinite(n) || Math.abs(n) > 10_000_000) throw new HttpError(400, 'Nilai tidak valid.');
      effect.amount = n;
    }
    await q(`UPDATE game_cards SET title=COALESCE($2,title), body=COALESCE($3,body), effect=$4, updated_at=now() WHERE id=$1`, [c.id, title ? String(title).slice(0, 40) : null, body ? String(body).slice(0, 200) : null, effect]);
    await loadContentOverrides({ full: false });
    await audit(req, 'card.update', 'card', c.id, req.body);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------- karakter & item
  r.get('/catalog', requireAdmin(...ALL), wrap(async (req, res) => {
    res.json({ characters: await many(`SELECT * FROM characters ORDER BY sort_order`), skins: await many(`SELECT * FROM character_skins ORDER BY kind, sort_order`) });
  }));
  r.patch('/catalog/:kind/:id', requireAdmin(...ADM), wrap(async (req, res) => {
    const table = req.params.kind === 'character' ? 'characters' : 'character_skins';
    const { price_coins, price_diamonds, active, unlock_type, name } = req.body || {};
    if (unlock_type && !['free', 'shop', 'mission', 'event', 'adventure'].includes(unlock_type)) throw new HttpError(400, 'Tipe tidak valid.');
    const row = await one(`UPDATE ${table} SET price_coins=COALESCE($2,price_coins), price_diamonds=COALESCE($3,price_diamonds), active=COALESCE($4,active), unlock_type=COALESCE($5,unlock_type), name=COALESCE($6,name) WHERE id=$1 RETURNING id`,
      [req.params.id, price_coins ?? null, price_diamonds ?? null, typeof active === 'boolean' ? active : null, unlock_type || null, name ? String(name).slice(0, 40) : null]);
    if (!row) throw new HttpError(404, 'Tidak ditemukan.');
    await audit(req, 'catalog.update', table, req.params.id, req.body);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------- event
  r.get('/events', requireAdmin(...ALL), wrap(async (req, res) => {
    res.json({ events: await many(`SELECT * FROM live_events ORDER BY starts_at DESC`), missions: await many(`SELECT * FROM missions ORDER BY kind, sort_order`) });
  }));
  r.post('/events', requireAdmin(...ADM), wrap(async (req, res) => {
    const { name, description, color, startsAt, endsAt } = req.body || {};
    if (!name || !description) throw new HttpError(400, 'Nama dan deskripsi wajib diisi.');
    const e = await one(`INSERT INTO live_events(name,description,color,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [String(name).slice(0, 60), String(description).slice(0, 400), /^#[0-9a-f]{6}$/i.test(color) ? color : '#e23b3b', startsAt || new Date(), endsAt || new Date(Date.now() + 7 * 86400000)]);
    await audit(req, 'event.create', 'event', e.id, req.body);
    res.json(e);
  }));
  r.patch('/events/:id', requireAdmin(...ADM), wrap(async (req, res) => {
    const { active, endsAt, name, description } = req.body || {};
    await q(`UPDATE live_events SET active=COALESCE($2,active), ends_at=COALESCE($3,ends_at), name=COALESCE($4,name), description=COALESCE($5,description) WHERE id::text=$1`,
      [req.params.id, typeof active === 'boolean' ? active : null, endsAt || null, name || null, description || null]);
    await audit(req, 'event.update', 'event', req.params.id, req.body);
    res.json({ ok: true });
  }));
  r.post('/missions', requireAdmin(...ADM), wrap(async (req, res) => {
    const m = req.body || {};
    if (!/^[a-z0-9_]{3,30}$/.test(m.id || '')) throw new HttpError(400, 'ID misi: huruf kecil/angka/_');
    if (!['daily', 'weekly', 'event'].includes(m.kind)) throw new HttpError(400, 'Jenis misi tidak valid.');
    if (!['games', 'wins', 'bought', 'built', 'hotels', 'rent_million', 'own_jakarta'].includes(m.metric)) throw new HttpError(400, 'Metrik tidak valid.');
    await q(`INSERT INTO missions(id,kind,event_id,title,metric,target,reward_coins,reward_diamonds,reward_xp,reward_tickets,reward_item) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET title=$4, metric=$5, target=$6, reward_coins=$7, reward_diamonds=$8, reward_xp=$9, reward_tickets=$10, reward_item=$11`,
      [m.id, m.kind, m.kind === 'event' ? m.eventId : null, String(m.title).slice(0, 60), m.metric, Math.max(1, Number(m.target) || 1), Number(m.rewardCoins) || 0, Number(m.rewardDiamonds) || 0, Number(m.rewardXp) || 0, Number(m.rewardTickets) || 0, m.rewardItem || null]);
    await audit(req, 'mission.upsert', 'mission', m.id, m);
    res.json({ ok: true });
  }));
  r.patch('/missions/:id', requireAdmin(...ADM), wrap(async (req, res) => {
    await q(`UPDATE missions SET active=$2 WHERE id=$1`, [req.params.id, !!req.body?.active]);
    await audit(req, 'mission.toggle', 'mission', req.params.id, req.body);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------- turnamen
  r.get('/tournaments', requireAdmin(...ALL), wrap(async (req, res) => {
    res.json(await many(`SELECT t.*, (SELECT count(*) FROM tournament_entries e WHERE e.tournament_id=t.id)::int AS participants FROM tournaments t ORDER BY created_at DESC`));
  }));
  r.post('/tournaments', requireAdmin(...ADM), wrap(async (req, res) => {
    const { name, description, entryTickets, days, prizeCoins, prizeDiamonds } = req.body || {};
    if (!name) throw new HttpError(400, 'Nama wajib diisi.');
    const t = await one(`INSERT INTO tournaments(name,description,entry_tickets,ends_at,prize_coins,prize_diamonds) VALUES ($1,$2,$3, now() + ($4 || ' days')::interval, $5, $6) RETURNING id`,
      [String(name).slice(0, 60), String(description || '').slice(0, 400), Math.max(0, Number(entryTickets) || 0), String(Math.max(1, Math.min(60, Number(days) || 7))),
        Array.isArray(prizeCoins) ? prizeCoins.slice(0, 3).map(Number) : [5000, 2500, 1000], Array.isArray(prizeDiamonds) ? prizeDiamonds.slice(0, 3).map(Number) : [100, 50, 20]]);
    await audit(req, 'tournament.create', 'tournament', t.id, req.body);
    res.json(t);
  }));
  r.post('/tournaments/:id/finish', requireAdmin(...ADM), wrap(async (req, res) => {
    const out = await tx(async (c) => {
      const t = (await c.query(`SELECT * FROM tournaments WHERE id::text=$1 FOR UPDATE`, [req.params.id])).rows[0];
      if (!t || t.status === 'finished') throw new HttpError(400, 'Turnamen tidak dapat diselesaikan.');
      const top = (await c.query(`SELECT user_id, points FROM tournament_entries WHERE tournament_id=$1 AND games > 0 ORDER BY points DESC, wins DESC, games ASC LIMIT 3`, [t.id])).rows;
      for (const [i, e] of top.entries()) {
        await c.query(`INSERT INTO inbox_messages(user_id,kind,title,body,reward) VALUES ($1,'tournament',$2,$3,$4)`,
          [e.user_id, `Hadiah ${t.name}`, `Selamat! Kamu meraih peringkat ${i + 1} dengan ${e.points} poin.`, { coins: t.prize_coins[i] || 0, diamonds: t.prize_diamonds[i] || 0 }]);
      }
      await c.query(`UPDATE tournaments SET status='finished', ends_at=LEAST(ends_at, now()) WHERE id=$1`, [t.id]);
      return { winners: top.length };
    });
    await audit(req, 'tournament.finish', 'tournament', req.params.id, out);
    res.json(out);
  }));

  // ---------------------------------------------------------- ekonomi & hadiah
  r.get('/economy', requireAdmin(...ALL), wrap(async (req, res) => {
    const settings = await one(`SELECT value FROM system_settings WHERE key='economy'`);
    const supply = await one(`SELECT sum(coins)::bigint AS coins, sum(diamonds)::bigint AS diamonds, sum(tickets)::bigint AS tickets FROM player_wallets`);
    const sources = await many(`SELECT currency, reason, sum(amount)::bigint AS total, count(*)::int AS n FROM wallet_transactions WHERE created_at > now() - interval '7 days' AND currency IN ('coins','diamonds','tickets') GROUP BY currency, reason ORDER BY abs(sum(amount)) DESC LIMIT 30`);
    const recent = await many(`SELECT t.*, u.username FROM wallet_transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 50`);
    res.json({ settings: settings?.value, supply, sources, recent });
  }));
  r.put('/economy', requireAdmin(...ADM), wrap(async (req, res) => {
    const v = req.body || {};
    const num = (x, min, max) => { const n = Number(x); if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, 'Nilai ekonomi di luar batas aman.'); return n; };
    const clean = {
      winCoins: num(v.winCoins, 0, 10000), winXp: num(v.winXp, 0, 5000), playXp: num(v.playXp, 0, 5000), winRp: num(v.winRp, 0, 200), lossRp: num(v.lossRp, -200, 0),
      placeCoins: (v.placeCoins || []).slice(0, 4).map((x) => num(x, 0, 10000)), dailyLogin: (v.dailyLogin || []).slice(0, 7).map((x) => num(x, 0, 10000)),
      dailyLoginDiamondDay7: num(v.dailyLoginDiamondDay7, 0, 500), guildCreateCost: num(v.guildCreateCost, 0, 100000),
      startCoins: num(v.startCoins, 0, 100000), startDiamonds: num(v.startDiamonds, 0, 1000), startTickets: num(v.startTickets, 0, 50),
    };
    if (clean.placeCoins.length !== 4 || clean.dailyLogin.length !== 7) throw new HttpError(400, 'placeCoins harus 4 nilai dan dailyLogin 7 nilai.');
    await q(`UPDATE system_settings SET value=$1, updated_at=now() WHERE key='economy'`, [clean]);
    await audit(req, 'economy.update', 'settings', 'economy', clean);
    res.json({ ok: true });
  }));
  r.post('/rewards', requireAdmin(...ADM, 'support'), wrap(async (req, res) => {
    const { userId, all, title, body, coins, diamonds, tickets, item } = req.body || {};
    const reward = {};
    if (Number(coins)) reward.coins = Math.min(100000, Math.max(0, Number(coins)));
    if (Number(diamonds)) reward.diamonds = Math.min(5000, Math.max(0, Number(diamonds)));
    if (Number(tickets)) reward.tickets = Math.min(100, Math.max(0, Number(tickets)));
    if (item) reward.item = String(item);
    const hasReward = Object.keys(reward).length > 0;
    if (hasReward && req.user.admin_role === 'support') throw new HttpError(403, 'Support hanya dapat mengirim pesan tanpa hadiah.');
    if (!title || !body) throw new HttpError(400, 'Judul dan isi wajib diisi.');
    let n;
    if (all) {
      if (req.user.admin_role === 'support') throw new HttpError(403, 'Tidak diizinkan.');
      n = (await q(`INSERT INTO inbox_messages(user_id,kind,title,body,reward) SELECT id,'admin',$1,$2,$3 FROM users WHERE NOT is_banned`, [String(title).slice(0, 80), String(body).slice(0, 500), hasReward ? reward : null])).rowCount;
    } else {
      n = (await q(`INSERT INTO inbox_messages(user_id,kind,title,body,reward) SELECT id,'admin',$2,$3,$4 FROM users WHERE id::text=$1`, [userId, String(title).slice(0, 80), String(body).slice(0, 500), hasReward ? reward : null])).rowCount;
    }
    await audit(req, 'reward.send', all ? 'all' : 'user', all ? null : userId, { title, reward, recipients: n });
    res.json({ recipients: n });
  }));

  // ---------------------------------------------------------- laporan & moderasi
  r.get('/reports', requireAdmin(...MOD), wrap(async (req, res) => {
    const reports = await many(`SELECT r.*, a.display_name AS reporter, b.display_name AS target FROM player_reports r JOIN player_profiles a ON a.user_id=r.reporter_id JOIN player_profiles b ON b.user_id=r.target_id ORDER BY (r.status='open') DESC, r.id DESC LIMIT 100`);
    const flagged = await many(`SELECT id, channel, channel_id, sender_id, sender_name, body, created_at FROM chat_messages WHERE flagged ORDER BY id DESC LIMIT 100`);
    res.json({ reports, flagged });
  }));
  r.post('/reports/:id', requireAdmin(...MOD), wrap(async (req, res) => {
    const status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
    await q(`UPDATE player_reports SET status=$2, handled_by=$3, handled_at=now() WHERE id=$1`, [req.params.id, status, req.user.id]);
    await audit(req, 'report.' + status, 'report', req.params.id, req.body);
    res.json({ ok: true });
  }));
  r.delete('/chat/:id', requireAdmin(...MOD), wrap(async (req, res) => {
    await q(`UPDATE chat_messages SET body='[dihapus moderator]', flagged=false WHERE id=$1`, [req.params.id]);
    await audit(req, 'chat.delete', 'chat', req.params.id);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------- sistem & audit
  r.get('/settings', requireAdmin(...ADM), wrap(async (req, res) => res.json(await many(`SELECT * FROM system_settings ORDER BY key`))));
  r.put('/settings/:key', requireAdmin(...SUPER), wrap(async (req, res) => {
    if (!['maintenance', 'motd'].includes(req.params.key)) throw new HttpError(400, 'Kunci tidak dapat diubah di sini.');
    const v = req.params.key === 'maintenance' ? { enabled: !!req.body?.enabled, message: String(req.body?.message || '').slice(0, 200) } : { text: String(req.body?.text || '').slice(0, 300) };
    await q(`UPDATE system_settings SET value=$2, updated_at=now() WHERE key=$1`, [req.params.key, v]);
    await audit(req, 'settings.update', 'settings', req.params.key, v);
    res.json({ ok: true });
  }));
  r.get('/audit', requireAdmin(...ADM), wrap(async (req, res) => res.json(await many(`SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 200`))));

  return r;
}
