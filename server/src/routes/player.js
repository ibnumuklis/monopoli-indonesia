// API pemain: auth, profil, dompet, login harian, inventaris & kustomisasi, toko, misi, achievement, leaderboard,
// event, adventure, inbox, riwayat pertandingan.
import express from 'express';
import { q, one, many, tx } from '../db/index.js';
import {
  requireAuth, HttpError, createUser, createSession, login, guestUser, supabaseUser, revokeSession, validateCredentials, hashPassword,
} from '../auth.js';
import { adjustWallet, grantItem, grantReward, periodKeys, economySettings, itemKind } from '../services/economy.js';
import { matchHistory } from '../services/matches.js';
import { LEVEL_XP } from '../../../shared/src/index.js';
import { config } from '../config.js';
import { RateLimiter } from '../game/moderation.js';

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function playerRoutes({ limiter, rooms }) {
  const r = express.Router();
  const meta = (req) => ({ ip: req.ip, ua: req.headers['user-agent'] });
  const authLimiter = new RateLimiter(config.authBurst, 1 / 6);
  const authLimit = (req, res, next) => (authLimiter.take(`auth:${req.ip}`) ? next() : res.status(429).json({ error: 'Terlalu banyak percobaan. Tunggu sebentar.' }));

  // ---------------------------------------------------------- auth
  r.post('/auth/register', authLimit, wrap(async (req, res) => {
    const { username, password, email, displayName } = req.body || {};
    validateCredentials({ username, password });
    if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Format email tidak valid.');
    const u = await createUser({ username, password, email, displayName: String(displayName || username).replace(/[<>]/g, '').slice(0, 20) });
    res.json({ token: await createSession(u.id, meta(req)) });
  }));

  r.post('/auth/login', authLimit, wrap(async (req, res) => {
    const id = await login(req.body?.username, req.body?.password);
    res.json({ token: await createSession(id, meta(req)) });
  }));

  r.post('/auth/guest', authLimit, wrap(async (req, res) => {
    const u = await guestUser(String(req.body?.name || 'Tamu').replace(/[<>]/g, ''));
    res.json({ token: await createSession(u.id, meta(req)) });
  }));

  r.post('/auth/supabase', authLimit, wrap(async (req, res) => {
    const id = await supabaseUser(req.body?.accessToken);
    res.json({ token: await createSession(id, meta(req)) });
  }));

  // Ubah akun tamu menjadi akun permanen (progres tetap tersimpan)
  r.post('/auth/upgrade', requireAuth, authLimit, wrap(async (req, res) => {
    if (req.user.auth_provider !== 'guest') throw new HttpError(400, 'Akun ini sudah permanen.');
    const { username, password, email } = req.body || {};
    validateCredentials({ username, password });
    const taken = await one(`SELECT 1 FROM users WHERE lower(username)=lower($1) AND id <> $2`, [username, req.user.id]);
    if (taken) throw new HttpError(409, 'Username sudah digunakan.');
    await q(`UPDATE users SET username=$2, password_hash=$3, email=$4, auth_provider='local' WHERE id=$1`, [req.user.id, username, await hashPassword(password), email || null]);
    res.json({ ok: true });
  }));

  r.post('/auth/logout', requireAuth, wrap(async (req, res) => { await revokeSession(req.token); res.json({ ok: true }); }));

  r.get('/config', (req, res) => res.json({
    supabase: config.supabaseUrl && config.supabaseAnonKey ? { url: config.supabaseUrl, anonKey: config.supabaseAnonKey } : null,
    payments: !!config.paymentProvider,
  }));

  // ---------------------------------------------------------- profil
  r.get('/me', requireAuth, wrap(async (req, res) => {
    const u = req.user;
    const p = await one(`SELECT p.*, p.last_daily_claim::text AS last_daily, w.coins, w.diamonds, w.tickets, us.username, us.auth_provider, us.email, us.created_at,
                            gm.guild_id, g.name AS guild_name, g.tag AS guild_tag
                       FROM player_profiles p JOIN player_wallets w ON w.user_id = p.user_id JOIN users us ON us.id = p.user_id
                       LEFT JOIN guild_members gm ON gm.user_id = p.user_id LEFT JOIN guilds g ON g.id = gm.guild_id
                      WHERE p.user_id = $1`, [u.id]);
    const unread = await one(`SELECT count(*)::int AS n FROM inbox_messages WHERE user_id=$1 AND read_at IS NULL`, [u.id]);
    const keys = periodKeys();
    const missionsReady = await one(`SELECT count(*)::int AS n FROM player_missions pm JOIN missions m ON m.id = pm.mission_id
                                      WHERE pm.user_id=$1 AND pm.claimed_at IS NULL AND pm.progress >= m.target AND (pm.period_key IN ($2,$3) OR pm.period_key LIKE 'event:%')`, [u.id, keys.daily, keys.weekly]);
    const room = rooms.roomOf(u.id);
    res.json({
      id: u.id, username: p.username, provider: p.auth_provider, email: p.email, createdAt: p.created_at, adminRole: u.admin_role || null,
      displayName: p.display_name, title: p.title, bio: p.bio, level: p.level, xp: p.xp, xpNext: LEVEL_XP(p.level), rankPoints: p.rank_points,
      gamesPlayed: p.games_played, wins: p.wins, losses: p.losses, totalRent: Number(p.total_rent), bestNetworth: Number(p.best_networth),
      character: p.selected_character, pawn: p.selected_pawn, dice: p.selected_dice, emotes: p.selected_emotes, settings: p.settings,
      wallet: { coins: Number(p.coins), diamonds: Number(p.diamonds), tickets: p.tickets },
      daily: { claimedToday: p.last_daily === keys.daily, streak: p.login_streak },
      guild: p.guild_id ? { id: p.guild_id, name: p.guild_name, tag: p.guild_tag } : null,
      unreadInbox: unread.n, missionsReady: missionsReady.n,
      mutedUntil: u.muted_until, activeRoom: room ? room.code : null,
    });
  }));

  r.patch('/me', requireAuth, wrap(async (req, res) => {
    const { displayName, bio, settings } = req.body || {};
    if (displayName !== undefined) {
      const dn = String(displayName).replace(/[<>]/g, '').trim();
      if (dn.length < 2 || dn.length > 20) throw new HttpError(400, 'Nama tampilan 2–20 karakter.');
      await q(`UPDATE player_profiles SET display_name=$2 WHERE user_id=$1`, [req.user.id, dn]);
    }
    if (bio !== undefined) await q(`UPDATE player_profiles SET bio=$2 WHERE user_id=$1`, [req.user.id, String(bio).replace(/[<>]/g, '').slice(0, 160)]);
    if (settings && typeof settings === 'object') {
      const clean = {};
      for (const k of ['music', 'sfx', 'graphics', 'camera', 'autoEnd', 'reducedMotion']) if (settings[k] !== undefined) clean[k] = settings[k];
      await q(`UPDATE player_profiles SET settings = settings || $2::jsonb WHERE user_id=$1`, [req.user.id, JSON.stringify(clean)]);
    }
    res.json({ ok: true });
  }));

  r.get('/players/:id', requireAuth, wrap(async (req, res) => {
    const p = await one(`SELECT p.user_id AS id, p.display_name, p.title, p.bio, p.level, p.rank_points, p.games_played, p.wins, p.best_networth, p.selected_character, u.username, u.created_at, g.name AS guild_name, g.tag AS guild_tag
                           FROM player_profiles p JOIN users u ON u.id=p.user_id LEFT JOIN guild_members gm ON gm.user_id=p.user_id LEFT JOIN guilds g ON g.id = gm.guild_id WHERE p.user_id=$1`, [req.params.id]);
    if (!p) throw new HttpError(404, 'Pemain tidak ditemukan.');
    const ach = await many(`SELECT a.title FROM player_achievements pa JOIN achievements a ON a.id=pa.achievement_id WHERE pa.user_id=$1 AND pa.unlocked_at IS NOT NULL`, [req.params.id]);
    res.json({ ...p, online: rooms.isOnline(p.id), achievements: ach.map((a) => a.title) });
  }));

  r.get('/me/history', requireAuth, wrap(async (req, res) => res.json(await matchHistory(req.user.id))));

  r.get('/me/transactions', requireAuth, wrap(async (req, res) => {
    res.json(await many(`SELECT currency, amount, balance_after, reason, created_at FROM wallet_transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 50`, [req.user.id]));
  }));

  // ---------------------------------------------------------- login harian
  r.post('/daily/claim', requireAuth, wrap(async (req, res) => {
    const keys = periodKeys();
    const out = await tx(async (c) => {
      const p = (await c.query(`SELECT last_daily_claim::text AS last, login_streak FROM player_profiles WHERE user_id=$1 FOR UPDATE`, [req.user.id])).rows[0];
      const last = p.last;
      if (last === keys.daily) throw new HttpError(400, 'Hadiah hari ini sudah diklaim. Kembali besok!');
      const yesterday = new Date(Date.parse(keys.daily) - 86400000).toISOString().slice(0, 10);
      const streak = last === yesterday ? (p.login_streak % 7) + 1 : 1;
      const eco = await economySettings(c);
      const coins = (eco.dailyLogin || [100, 150, 200, 250, 300, 400, 1000])[streak - 1];
      const diamonds = streak === 7 ? eco.dailyLoginDiamondDay7 || 10 : 0;
      await c.query(`UPDATE player_profiles SET last_daily_claim=$2, login_streak=$3 WHERE user_id=$1`, [req.user.id, keys.daily, streak]);
      await grantReward(c, req.user.id, { coins, diamonds, xp: 20 }, `Login harian hari ke-${streak}`, null, `daily:${req.user.id}:${keys.daily}`);
      return { streak, coins, diamonds };
    });
    res.json(out);
  }));

  // ---------------------------------------------------------- katalog, inventaris, kustomisasi
  r.get('/catalog', requireAuth, wrap(async (req, res) => {
    const [chars, skins, inv] = await Promise.all([
      many(`SELECT * FROM characters WHERE active ORDER BY sort_order`),
      many(`SELECT * FROM character_skins WHERE active ORDER BY sort_order`),
      many(`SELECT item_kind, item_id, acquired_at, source FROM player_inventory WHERE user_id=$1`, [req.user.id]),
    ]);
    const owned = new Set(inv.map((i) => i.item_id));
    res.json({
      characters: chars.map((c) => ({ ...c, owned: owned.has(c.id) })),
      skins: skins.map((s) => ({ ...s, owned: owned.has(s.id) })),
      inventory: inv,
    });
  }));

  r.post('/customize', requireAuth, wrap(async (req, res) => {
    const { character, pawn, dice, emotes } = req.body || {};
    const own = async (id) => !!(await one(`SELECT 1 FROM player_inventory WHERE user_id=$1 AND item_id=$2`, [req.user.id, id]));
    if (character) { if (!(await own(character))) throw new HttpError(403, 'Karakter belum dimiliki.'); await q(`UPDATE player_profiles SET selected_character=$2 WHERE user_id=$1`, [req.user.id, character]); }
    if (pawn) { if (!(await own(pawn))) throw new HttpError(403, 'Skin pion belum dimiliki.'); await q(`UPDATE player_profiles SET selected_pawn=$2 WHERE user_id=$1`, [req.user.id, pawn]); }
    if (dice) { if (!(await own(dice))) throw new HttpError(403, 'Skin dadu belum dimiliki.'); await q(`UPDATE player_profiles SET selected_dice=$2 WHERE user_id=$1`, [req.user.id, dice]); }
    if (Array.isArray(emotes)) {
      const list = [...new Set(emotes.map(String))].slice(0, 6);
      for (const e of list) if (!(await own(e))) throw new HttpError(403, 'Emote belum dimiliki.');
      await q(`UPDATE player_profiles SET selected_emotes=$2 WHERE user_id=$1`, [req.user.id, list]);
    }
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------- toko
  r.post('/shop/buy', requireAuth, wrap(async (req, res) => {
    const { itemId, currency, requestId } = req.body || {};
    if (!limiter.take(`shop:${req.user.id}`)) throw new HttpError(429, 'Terlalu cepat.');
    const kind = itemKind(String(itemId)) || null;
    const item = kind === 'character'
      ? await one(`SELECT id, name, unlock_type, price_coins, price_diamonds FROM characters WHERE id=$1 AND active`, [itemId])
      : await one(`SELECT id, name, kind, unlock_type, price_coins, price_diamonds FROM character_skins WHERE id=$1 AND active`, [itemId]);
    if (!item) throw new HttpError(404, 'Item tidak ditemukan.');
    if (item.unlock_type !== 'shop') throw new HttpError(400, 'Item ini diperoleh melalui misi, event, atau adventure — tidak dijual.');
    const cur = currency === 'diamonds' ? 'diamonds' : 'coins';
    const price = cur === 'diamonds' ? item.price_diamonds : item.price_coins;
    if (!price) throw new HttpError(400, `Item tidak dapat dibeli dengan ${cur === 'diamonds' ? 'diamond' : 'koin'}.`);
    const result = await tx(async (c) => {
      // Item dimasukkan dulu: unique index (user,item) mengunci request paralel sehingga saldo tidak terdebit dua kali.
      const granted = await grantItem(c, req.user.id, item.id, 'shop');
      if (!granted) throw new HttpError(400, 'Item sudah dimiliki.');
      const idem = `shop:${req.user.id}:${item.id}:${String(requestId || '').slice(0, 40) || 'x'}`;
      return adjustWallet(c, req.user.id, cur, -price, `Beli ${item.name}`, item.id, idem);
    });
    res.json({ ok: true, balance: result.balance });
  }));

  r.post('/shop/tickets', requireAuth, wrap(async (req, res) => {
    // Tukar diamond → tiket (10 diamond = 1 tiket)
    const n = Math.max(1, Math.min(10, Math.floor(Number(req.body?.count) || 1)));
    await tx(async (c) => {
      await adjustWallet(c, req.user.id, 'diamonds', -10 * n, `Tukar ${n} tiket`);
      await adjustWallet(c, req.user.id, 'tickets', n, 'Tukar diamond');
    });
    res.json({ ok: true });
  }));

  r.post('/shop/topup', requireAuth, wrap(async (req, res) => {
    // Pembelian dengan uang sungguhan sengaja tidak diaktifkan tanpa payment gateway resmi.
    if (!config.paymentProvider) throw new HttpError(501, 'Top up diamond belum tersedia. Pembayaran memerlukan konfigurasi payment gateway resmi (lihat docs/DEPLOYMENT.md).');
    throw new HttpError(501, 'Integrasi pembayaran perlu diaktifkan pada server produksi.');
  }));

  // ---------------------------------------------------------- misi & achievement
  r.get('/missions', requireAuth, wrap(async (req, res) => {
    const keys = periodKeys();
    const rows = await many(`SELECT m.*, e.name AS event_name, e.ends_at AS event_ends,
        COALESCE(pm.progress,0) AS progress, pm.claimed_at
      FROM missions m LEFT JOIN live_events e ON e.id = m.event_id
      LEFT JOIN player_missions pm ON pm.mission_id = m.id AND pm.user_id = $1 AND pm.period_key = CASE m.kind WHEN 'daily' THEN $2 WHEN 'weekly' THEN $3 ELSE 'event:' || m.event_id END
      WHERE m.active AND (m.kind <> 'event' OR (e.active AND now() BETWEEN e.starts_at AND e.ends_at)) ORDER BY m.sort_order`, [req.user.id, keys.daily, keys.weekly]);
    const ach = await many(`SELECT a.*, COALESCE(pa.progress,0) AS progress, pa.unlocked_at, pa.claimed_at FROM achievements a LEFT JOIN player_achievements pa ON pa.achievement_id=a.id AND pa.user_id=$1 ORDER BY a.sort_order`, [req.user.id]);
    res.json({ missions: rows, achievements: ach, keys });
  }));

  r.post('/missions/:id/claim', requireAuth, wrap(async (req, res) => {
    const keys = periodKeys();
    const out = await tx(async (c) => {
      const m = (await c.query(`SELECT * FROM missions WHERE id=$1`, [req.params.id])).rows[0];
      if (!m) throw new HttpError(404, 'Misi tidak ditemukan.');
      const pk = m.kind === 'daily' ? keys.daily : m.kind === 'weekly' ? keys.weekly : `event:${m.event_id}`;
      const pm = (await c.query(`UPDATE player_missions SET claimed_at = now() WHERE user_id=$1 AND mission_id=$2 AND period_key=$3 AND claimed_at IS NULL AND progress >= $4 RETURNING 1`, [req.user.id, m.id, pk, m.target])).rows[0];
      if (!pm) throw new HttpError(400, 'Misi belum selesai atau hadiah sudah diklaim.');
      return grantReward(c, req.user.id, { coins: m.reward_coins, diamonds: m.reward_diamonds, xp: m.reward_xp, tickets: m.reward_tickets, item: m.reward_item }, `Misi: ${m.title}`, m.id);
    });
    res.json(out);
  }));

  r.post('/achievements/:id/claim', requireAuth, wrap(async (req, res) => {
    const out = await tx(async (c) => {
      const a = (await c.query(`SELECT * FROM achievements WHERE id=$1`, [req.params.id])).rows[0];
      if (!a) throw new HttpError(404, 'Achievement tidak ditemukan.');
      const pa = (await c.query(`UPDATE player_achievements SET claimed_at=now() WHERE user_id=$1 AND achievement_id=$2 AND unlocked_at IS NOT NULL AND claimed_at IS NULL RETURNING 1`, [req.user.id, a.id])).rows[0];
      if (!pa) throw new HttpError(400, 'Achievement belum terbuka atau sudah diklaim.');
      return grantReward(c, req.user.id, { coins: a.reward_coins, diamonds: a.reward_diamonds, item: a.reward_item }, `Achievement: ${a.title}`, a.id);
    });
    res.json(out);
  }));

  // ---------------------------------------------------------- leaderboard
  r.get('/leaderboard', requireAuth, wrap(async (req, res) => {
    const period = ['daily', 'weekly', 'monthly', 'season', 'all'].includes(req.query.period) ? req.query.period : 'weekly';
    const scope = req.query.scope || 'global';
    const key = periodKeys()[period];
    let rows;
    if (scope === 'guild') {
      rows = await many(`SELECT g.id, g.name, g.tag, g.points, (SELECT count(*) FROM guild_members m WHERE m.guild_id=g.id)::int AS members FROM guilds g ORDER BY g.points DESC LIMIT 50`);
      return res.json({ period, scope, rows });
    }
    const friendFilter = scope === 'friends'
      ? `AND (l.user_id = $3 OR l.user_id IN (SELECT CASE WHEN requester_id=$3 THEN addressee_id ELSE requester_id END FROM friendships WHERE status='accepted' AND (requester_id=$3 OR addressee_id=$3)))`
      : '';
    rows = await many(`SELECT l.user_id, l.points, l.wins, l.games, p.display_name, p.level, p.selected_character, p.rank_points
                         FROM leaderboard_entries l JOIN player_profiles p ON p.user_id = l.user_id
                        WHERE l.period=$1 AND l.period_key=$2 ${friendFilter} ORDER BY l.points DESC, l.wins DESC LIMIT 100`,
      scope === 'friends' ? [period, key, req.user.id] : [period, key]);
    const mine = await one(`SELECT points, wins, games FROM leaderboard_entries WHERE user_id=$1 AND period=$2 AND period_key=$3`, [req.user.id, period, key]);
    res.json({ period, scope, key, rows, mine });
  }));

  // ---------------------------------------------------------- event
  r.get('/events', requireAuth, wrap(async (req, res) => {
    res.json(await many(`SELECT id, name, description, color, starts_at, ends_at FROM live_events WHERE active AND ends_at > now() ORDER BY starts_at`));
  }));

  // ---------------------------------------------------------- adventure
  r.get('/adventure', requireAuth, wrap(async (req, res) => {
    const stages = await many(`SELECT s.*, COALESCE(p.stars,0) AS stars, p.completed_at FROM adventure_stages s LEFT JOIN adventure_progress p ON p.stage_id=s.id AND p.user_id=$1 ORDER BY s.sort_order`, [req.user.id]);
    // stage terbuka bila stage sebelumnya selesai
    let open = true;
    for (const s of stages) { s.unlocked = open; open = !!s.completed_at; }
    res.json(stages);
  }));

  // ---------------------------------------------------------- inbox
  r.get('/inbox', requireAuth, wrap(async (req, res) => {
    res.json(await many(`SELECT * FROM inbox_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]));
  }));
  r.post('/inbox/:id/read', requireAuth, wrap(async (req, res) => {
    await q(`UPDATE inbox_messages SET read_at = COALESCE(read_at, now()) WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  }));
  r.post('/inbox/read-all', requireAuth, wrap(async (req, res) => {
    await q(`UPDATE inbox_messages SET read_at = now() WHERE user_id=$1 AND read_at IS NULL`, [req.user.id]);
    res.json({ ok: true });
  }));
  r.post('/inbox/:id/claim', requireAuth, wrap(async (req, res) => {
    const out = await tx(async (c) => {
      const m = (await c.query(`UPDATE inbox_messages SET claimed_at=now(), read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 AND reward IS NOT NULL AND claimed_at IS NULL RETURNING reward, title`, [req.params.id, req.user.id])).rows[0];
      if (!m) throw new HttpError(400, 'Tidak ada hadiah untuk diklaim.');
      return grantReward(c, req.user.id, m.reward, `Inbox: ${m.title}`, String(req.params.id));
    });
    res.json(out);
  }));

  return r;
}
