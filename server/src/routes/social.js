// API sosial: teman, pesan pribadi, blokir, laporan, guild, turnamen.
import express from 'express';
import { q, one, many, tx } from '../db/index.js';
import { requireAuth, HttpError } from '../auth.js';
import { adjustWallet, economySettings } from '../services/economy.js';
import { moderate } from '../game/moderation.js';
import { wrap } from './player.js';

export function socialRoutes({ rooms, limiter, spam }) {
  const r = express.Router();
  r.use(requireAuth);

  const friendIds = async (uid) => (await many(`SELECT CASE WHEN requester_id=$1 THEN addressee_id ELSE requester_id END AS id FROM friendships WHERE status='accepted' AND (requester_id=$1 OR addressee_id=$1)`, [uid])).map((x) => x.id);
  const isBlocked = async (a, b) => !!(await one(`SELECT 1 FROM blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)`, [a, b]));

  // ---------------------------------------------------------- teman
  r.get('/friends', wrap(async (req, res) => {
    const rows = await many(`SELECT f.id, f.status, f.requester_id, f.addressee_id, f.created_at,
        p.user_id AS other_id, p.display_name, p.level, p.selected_character, p.rank_points, u.last_seen_at
      FROM friendships f JOIN player_profiles p ON p.user_id = CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END
      JOIN users u ON u.id = p.user_id
      WHERE f.requester_id=$1 OR f.addressee_id=$1 ORDER BY f.created_at DESC`, [req.user.id]);
    const blocked = await many(`SELECT b.blocked_id AS id, p.display_name FROM blocks b JOIN player_profiles p ON p.user_id=b.blocked_id WHERE b.user_id=$1`, [req.user.id]);
    res.json({
      friends: rows.filter((x) => x.status === 'accepted').map((x) => ({ ...x, online: rooms.isOnline(x.other_id), inRoom: !!rooms.roomOf(x.other_id) })),
      incoming: rows.filter((x) => x.status === 'pending' && x.addressee_id === req.user.id),
      outgoing: rows.filter((x) => x.status === 'pending' && x.requester_id === req.user.id),
      blocked,
    });
  }));

  r.get('/players/search/:q', wrap(async (req, res) => {
    const term = String(req.params.q).slice(0, 20).replace(/[\\%_]/g, '\\$&');
    if (term.length < 2) return res.json([]);
    res.json(await many(`SELECT p.user_id AS id, p.display_name, p.level, p.selected_character, u.username FROM player_profiles p JOIN users u ON u.id=p.user_id
                          WHERE (u.username ILIKE $1 OR p.display_name ILIKE $1) AND p.user_id <> $2 AND NOT u.is_banned LIMIT 20`, [`%${term}%`, req.user.id]));
  }));

  r.post('/friends/request', wrap(async (req, res) => {
    const target = String(req.body?.userId || '');
    if (!limiter.take(`fr:${req.user.id}`)) throw new HttpError(429, 'Terlalu cepat.');
    if (target === req.user.id) throw new HttpError(400, 'Tidak dapat menambahkan diri sendiri.');
    const t = await one(`SELECT id FROM users WHERE id::text=$1`, [target]);
    if (!t) throw new HttpError(404, 'Pemain tidak ditemukan.');
    if (await isBlocked(req.user.id, target)) throw new HttpError(403, 'Tidak dapat mengirim permintaan pertemanan.');
    const ex = await one(`SELECT id, status, requester_id FROM friendships WHERE LEAST(requester_id,addressee_id)=LEAST($1::uuid,$2::uuid) AND GREATEST(requester_id,addressee_id)=GREATEST($1::uuid,$2::uuid)`, [req.user.id, target]);
    if (ex) {
      if (ex.status === 'accepted') throw new HttpError(400, 'Sudah berteman.');
      if (ex.requester_id === req.user.id) throw new HttpError(400, 'Permintaan sudah dikirim.');
      await q(`UPDATE friendships SET status='accepted' WHERE id=$1`, [ex.id]);
      return res.json({ ok: true, accepted: true });
    }
    await q(`INSERT INTO friendships(requester_id, addressee_id) VALUES ($1,$2)`, [req.user.id, target]);
    await q(`INSERT INTO inbox_messages(user_id,kind,title,body,data) VALUES ($1,'friend','Permintaan pertemanan',$2,$3)`, [target, `${req.user.display_name} ingin berteman denganmu.`, { from: req.user.id }]);
    rooms.emitUser(target, 'social:changed', {});
    res.json({ ok: true });
  }));

  r.post('/friends/:id/accept', wrap(async (req, res) => {
    const f = await one(`UPDATE friendships SET status='accepted' WHERE id=$1 AND addressee_id=$2 AND status='pending' RETURNING requester_id`, [req.params.id, req.user.id]);
    if (!f) throw new HttpError(404, 'Permintaan tidak ditemukan.');
    rooms.emitUser(f.requester_id, 'social:changed', {});
    res.json({ ok: true });
  }));

  r.delete('/friends/:id', wrap(async (req, res) => {
    await q(`DELETE FROM friendships WHERE id=$1 AND (requester_id=$2 OR addressee_id=$2)`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  }));

  r.post('/block', wrap(async (req, res) => {
    const target = String(req.body?.userId || '');
    if (target === req.user.id) throw new HttpError(400, 'Tidak valid.');
    await q(`INSERT INTO blocks(user_id,blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, target]);
    await q(`DELETE FROM friendships WHERE LEAST(requester_id,addressee_id)=LEAST($1::uuid,$2::uuid) AND GREATEST(requester_id,addressee_id)=GREATEST($1::uuid,$2::uuid)`, [req.user.id, target]);
    res.json({ ok: true });
  }));
  r.delete('/block/:id', wrap(async (req, res) => {
    await q(`DELETE FROM blocks WHERE user_id=$1 AND blocked_id=$2`, [req.user.id, req.params.id]);
    res.json({ ok: true });
  }));

  r.post('/report', wrap(async (req, res) => {
    const { userId, reason, detail } = req.body || {};
    if (!limiter.take(`report:${req.user.id}`, 3)) throw new HttpError(429, 'Terlalu banyak laporan.');
    if (!['spam', 'toxic', 'cheat', 'nama_tidak_pantas', 'lainnya'].includes(reason)) throw new HttpError(400, 'Alasan tidak valid.');
    if (userId === req.user.id) throw new HttpError(400, 'Tidak valid.');
    await q(`INSERT INTO player_reports(reporter_id,target_id,reason,detail) VALUES ($1,$2,$3,$4)`, [req.user.id, userId, reason, String(detail || '').slice(0, 300)]);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------- pesan pribadi
  const dmKey = (a, b) => [a, b].sort().join(':');
  r.get('/dm/:userId', wrap(async (req, res) => {
    const rows = await many(`SELECT id, sender_id, sender_name, body, created_at FROM chat_messages WHERE channel='dm' AND channel_id=$1 ORDER BY id DESC LIMIT 50`, [dmKey(req.user.id, req.params.userId)]);
    res.json(rows.reverse());
  }));
  r.post('/dm/:userId', wrap(async (req, res) => {
    const to = req.params.userId;
    if (!limiter.take(`dm:${req.user.id}`)) throw new HttpError(429, 'Terlalu cepat.');
    if (req.user.muted_until && new Date(req.user.muted_until) > new Date()) throw new HttpError(403, 'Anda sedang dibisukan.');
    if (!(await friendIds(req.user.id)).includes(to)) throw new HttpError(403, 'Pesan pribadi hanya untuk teman.');
    if (await isBlocked(req.user.id, to)) throw new HttpError(403, 'Tidak dapat mengirim pesan.');
    const { text, flagged } = moderate(req.body?.text);
    if (!text) throw new HttpError(400, 'Pesan kosong.');
    if (!spam.check(`dm:${req.user.id}`, text)) throw new HttpError(429, 'Jangan mengirim pesan yang sama berulang-ulang.');
    const m = await one(`INSERT INTO chat_messages(channel,channel_id,sender_id,sender_name,body,flagged) VALUES ('dm',$1,$2,$3,$4,$5) RETURNING id, sender_id, sender_name, body, created_at`,
      [dmKey(req.user.id, to), req.user.id, req.user.display_name, text, flagged]);
    rooms.emitUser(to, 'dm:message', { ...m, from: req.user.id });
    res.json(m);
  }));

  // ---------------------------------------------------------- guild
  r.get('/guilds', wrap(async (req, res) => {
    res.json(await many(`SELECT g.id, g.name, g.tag, g.description, g.points, g.max_members, (SELECT count(*) FROM guild_members m WHERE m.guild_id=g.id)::int AS members FROM guilds g ORDER BY g.points DESC LIMIT 50`));
  }));
  r.get('/guilds/:id', wrap(async (req, res) => {
    const g = await one(`SELECT * FROM guilds WHERE id::text=$1`, [req.params.id]);
    if (!g) throw new HttpError(404, 'Guild tidak ditemukan.');
    const members = await many(`SELECT m.user_id, m.role, m.joined_at, p.display_name, p.level, p.selected_character, p.rank_points FROM guild_members m JOIN player_profiles p ON p.user_id=m.user_id WHERE m.guild_id=$1 ORDER BY m.role, p.rank_points DESC`, [g.id]);
    const isMember = members.some((m) => m.user_id === req.user.id);
    const chat = isMember ? (await many(`SELECT id, sender_id, sender_name, body, created_at FROM chat_messages WHERE channel='guild' AND channel_id=$1 ORDER BY id DESC LIMIT 40`, [g.id])).reverse() : [];
    res.json({ ...g, members: members.map((m) => ({ ...m, online: rooms.isOnline(m.user_id) })), isMember, chat });
  }));
  r.post('/guilds', wrap(async (req, res) => {
    const name = String(req.body?.name || '').replace(/[<>]/g, '').trim();
    const tag = String(req.body?.tag || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (name.length < 3 || name.length > 24) throw new HttpError(400, 'Nama guild 3–24 karakter.');
    if (tag.length < 2 || tag.length > 5) throw new HttpError(400, 'Tag 2–5 huruf/angka.');
    const g = await tx(async (c) => {
      if ((await c.query(`SELECT 1 FROM guild_members WHERE user_id=$1`, [req.user.id])).rows.length) throw new HttpError(400, 'Anda sudah tergabung dalam guild.');
      if ((await c.query(`SELECT 1 FROM guilds WHERE lower(name)=lower($1)`, [name])).rows.length) throw new HttpError(409, 'Nama guild sudah dipakai.');
      const eco = await economySettings(c);
      await adjustWallet(c, req.user.id, 'coins', -(eco.guildCreateCost || 5000), `Mendirikan guild ${name}`);
      const row = (await c.query(`INSERT INTO guilds(name,tag,description,owner_id) VALUES ($1,$2,$3,$4) RETURNING id`, [name, tag, String(req.body?.description || '').slice(0, 200), req.user.id])).rows[0];
      await c.query(`INSERT INTO guild_members(guild_id,user_id,role) VALUES ($1,$2,'owner')`, [row.id, req.user.id]);
      return row;
    });
    res.json(g);
  }));
  r.post('/guilds/:id/join', wrap(async (req, res) => {
    await tx(async (c) => {
      if ((await c.query(`SELECT 1 FROM guild_members WHERE user_id=$1`, [req.user.id])).rows.length) throw new HttpError(400, 'Anda sudah tergabung dalam guild.');
      const g = (await c.query(`SELECT id, max_members, (SELECT count(*) FROM guild_members m WHERE m.guild_id=guilds.id)::int AS n FROM guilds WHERE id::text=$1`, [req.params.id])).rows[0];
      if (!g) throw new HttpError(404, 'Guild tidak ditemukan.');
      if (g.n >= g.max_members) throw new HttpError(400, 'Guild sudah penuh.');
      await c.query(`INSERT INTO guild_members(guild_id,user_id) VALUES ($1,$2)`, [g.id, req.user.id]);
    });
    res.json({ ok: true });
  }));
  r.post('/guilds/leave', wrap(async (req, res) => {
    await tx(async (c) => {
      const m = (await c.query(`SELECT guild_id, role FROM guild_members WHERE user_id=$1`, [req.user.id])).rows[0];
      if (!m) throw new HttpError(400, 'Anda tidak tergabung dalam guild.');
      await c.query(`DELETE FROM guild_members WHERE user_id=$1`, [req.user.id]);
      if (m.role === 'owner') {
        const next = (await c.query(`SELECT user_id FROM guild_members WHERE guild_id=$1 ORDER BY joined_at LIMIT 1`, [m.guild_id])).rows[0];
        if (next) {
          await c.query(`UPDATE guild_members SET role='owner' WHERE guild_id=$1 AND user_id=$2`, [m.guild_id, next.user_id]);
          await c.query(`UPDATE guilds SET owner_id=$2 WHERE id=$1`, [m.guild_id, next.user_id]);
        } else await c.query(`DELETE FROM guilds WHERE id=$1`, [m.guild_id]);
      }
    });
    res.json({ ok: true });
  }));
  r.post('/guilds/:id/chat', wrap(async (req, res) => {
    const m = await one(`SELECT 1 FROM guild_members WHERE guild_id::text=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    if (!m) throw new HttpError(403, 'Hanya anggota guild.');
    if (!limiter.take(`gchat:${req.user.id}`)) throw new HttpError(429, 'Terlalu cepat.');
    if (req.user.muted_until && new Date(req.user.muted_until) > new Date()) throw new HttpError(403, 'Anda sedang dibisukan.');
    const { text, flagged } = moderate(req.body?.text);
    if (!text) throw new HttpError(400, 'Pesan kosong.');
    const row = await one(`INSERT INTO chat_messages(channel,channel_id,sender_id,sender_name,body,flagged) VALUES ('guild',$1,$2,$3,$4,$5) RETURNING id, sender_id, sender_name, body, created_at`, [req.params.id, req.user.id, req.user.display_name, text, flagged]);
    const members = await many(`SELECT user_id FROM guild_members WHERE guild_id::text=$1`, [req.params.id]);
    for (const mm of members) rooms.emitUser(mm.user_id, 'guild:message', row);
    res.json(row);
  }));

  // ---------------------------------------------------------- turnamen
  r.get('/tournaments', wrap(async (req, res) => {
    const list = await many(`SELECT t.*, (SELECT count(*) FROM tournament_entries e WHERE e.tournament_id=t.id)::int AS participants,
        EXISTS(SELECT 1 FROM tournament_entries e WHERE e.tournament_id=t.id AND e.user_id=$1) AS joined
      FROM tournaments t WHERE t.status IN ('open','upcoming','finished') ORDER BY (t.status='open') DESC, t.ends_at DESC LIMIT 20`, [req.user.id]);
    res.json(list);
  }));
  r.get('/tournaments/:id', wrap(async (req, res) => {
    const t = await one(`SELECT * FROM tournaments WHERE id::text=$1`, [req.params.id]);
    if (!t) throw new HttpError(404, 'Turnamen tidak ditemukan.');
    const standings = await many(`SELECT e.user_id, e.points, e.games, e.wins, p.display_name, p.selected_character, p.level FROM tournament_entries e JOIN player_profiles p ON p.user_id=e.user_id WHERE e.tournament_id=$1 ORDER BY e.points DESC, e.wins DESC, e.games ASC LIMIT 100`, [t.id]);
    res.json({ ...t, standings, joined: standings.some((s) => s.user_id === req.user.id) });
  }));
  r.post('/tournaments/:id/join', wrap(async (req, res) => {
    await tx(async (c) => {
      const t = (await c.query(`SELECT * FROM tournaments WHERE id::text=$1`, [req.params.id])).rows[0];
      if (!t || t.status !== 'open' || new Date(t.ends_at) < new Date()) throw new HttpError(400, 'Turnamen tidak sedang dibuka.');
      if ((await c.query(`SELECT 1 FROM tournament_entries WHERE tournament_id=$1 AND user_id=$2`, [t.id, req.user.id])).rows.length) throw new HttpError(400, 'Sudah terdaftar.');
      if (t.entry_tickets) await adjustWallet(c, req.user.id, 'tickets', -t.entry_tickets, `Daftar ${t.name}`, t.id);
      await c.query(`INSERT INTO tournament_entries(tournament_id,user_id) VALUES ($1,$2)`, [t.id, req.user.id]);
    });
    res.json({ ok: true });
  }));

  return r;
}
