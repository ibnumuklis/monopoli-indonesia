// Ekonomi virtual: dompet (koin, diamond, tiket), item, XP/level, misi, achievement, leaderboard.
// Semua mutasi saldo lewat fungsi di sini agar tercatat di wallet_transactions (audit trail).
import { HttpError } from '../auth.js';
import { LEVEL_XP, titleFor, CHARACTERS, SKINS } from '../../../shared/src/index.js';

// ---------------------------------------------------------------- periode (zona WIB)
const WIB = 7 * 3600_000;
export function periodKeys(d = new Date()) {
  const w = new Date(d.getTime() + WIB);
  const day = w.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  // ISO week
  const t = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  const season = `${w.getUTCFullYear()}-S${Math.floor(w.getUTCMonth() / 3) + 1}`;
  return { daily: day, weekly: `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, monthly: month, season, all: 'all' };
}

// ---------------------------------------------------------------- dompet
const CUR = new Set(['coins', 'diamonds', 'tickets']);

/** Ubah saldo (amount boleh negatif). Gagal bila saldo tidak cukup. Idempoten dengan idemKey. */
export async function adjustWallet(c, userId, currency, amount, reason, ref = null, idemKey = null) {
  if (!CUR.has(currency)) throw new HttpError(400, 'Mata uang tidak dikenal.');
  amount = Math.trunc(amount);
  if (!amount) return null;
  if (idemKey) {
    const dup = await c.query(`SELECT balance_after FROM wallet_transactions WHERE idempotency_key = $1`, [idemKey]);
    if (dup.rows.length) return { duplicate: true, balance: Number(dup.rows[0].balance_after) };
  }
  const r = await c.query(
    `UPDATE player_wallets SET ${currency} = ${currency} + $2, updated_at = now() WHERE user_id = $1 AND ${currency} + $2 >= 0 RETURNING ${currency} AS bal`,
    [userId, amount]);
  if (!r.rows.length) throw new HttpError(400, `${currency === 'coins' ? 'Koin' : currency === 'diamonds' ? 'Diamond' : 'Tiket'} tidak cukup.`);
  const bal = Number(r.rows[0].bal);
  await c.query(`INSERT INTO wallet_transactions(user_id,currency,amount,balance_after,reason,ref,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, currency, amount, bal, reason, ref, idemKey]);
  return { balance: bal };
}

export function itemKind(itemId) {
  if (CHARACTERS.some((c) => c.id === itemId)) return 'character';
  const s = SKINS.find((x) => x.id === itemId);
  return s ? s.kind : null;
}

export async function grantItem(c, userId, itemId, source) {
  const kind = itemKind(itemId) || (await c.query(`SELECT kind FROM character_skins WHERE id=$1`, [itemId])).rows[0]?.kind
    || ((await c.query(`SELECT 1 FROM characters WHERE id=$1`, [itemId])).rows.length ? 'character' : null);
  if (!kind) return false;
  const r = await c.query(`INSERT INTO player_inventory(user_id,item_kind,item_id,source) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`, [userId, kind, itemId, source]);
  return r.rows.length > 0;
}

/** Berikan paket hadiah {coins, diamonds, tickets, xp, item}. */
export async function grantReward(c, userId, reward, reason, ref = null, idemPrefix = null) {
  const out = {};
  for (const cur of ['coins', 'diamonds', 'tickets']) {
    if (reward[cur]) { await adjustWallet(c, userId, cur, reward[cur], reason, ref, idemPrefix ? `${idemPrefix}:${cur}` : null); out[cur] = reward[cur]; }
  }
  if (reward.xp) out.level = await addXp(c, userId, reward.xp, reason);
  if (reward.item) out.item = (await grantItem(c, userId, reward.item, reason)) ? reward.item : null;
  return out;
}

export async function addXp(c, userId, xp, reason) {
  const p = (await c.query(`SELECT level, xp FROM player_profiles WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
  if (!p) return null;
  let { level } = p; let cur = p.xp + xp; let leveled = 0;
  while (cur >= LEVEL_XP(level)) { cur -= LEVEL_XP(level); level += 1; leveled += 1; }
  await c.query(`UPDATE player_profiles SET level=$2, xp=$3, title=$4, updated_at=now() WHERE user_id=$1`, [userId, level, cur, titleFor(level)]);
  await c.query(`INSERT INTO wallet_transactions(user_id,currency,amount,balance_after,reason) VALUES ($1,'xp',$2,$3,$4)`, [userId, xp, cur, reason]);
  if (leveled) {
    // hadiah naik level
    await adjustWallet(c, userId, 'coins', 200 * leveled, `Naik ke level ${level}`);
    if (level % 5 === 0) await adjustWallet(c, userId, 'diamonds', 10, `Bonus level ${level}`);
    await c.query(`INSERT INTO inbox_messages(user_id,kind,title,body) VALUES ($1,'reward',$2,$3)`, [userId, `Naik ke Level ${level}!`, `Selamat! Kamu sekarang bergelar "${titleFor(level)}". Bonus ${200 * leveled} koin telah ditambahkan.`]);
  }
  return { level, xp: cur, leveled };
}

// ---------------------------------------------------------------- misi & achievement
export async function missionPeriodKey(c, m, keys) {
  if (m.kind === 'daily') return keys.daily;
  if (m.kind === 'weekly') return keys.weekly;
  return `event:${m.event_id}`;
}

/** Tambah progres metrik (games, wins, bought, built, hotels, rent_million, own_jakarta). */
export async function addProgress(c, userId, metrics) {
  const keys = periodKeys();
  const ms = (await c.query(
    `SELECT m.* FROM missions m LEFT JOIN live_events e ON e.id = m.event_id
      WHERE m.active AND (m.kind <> 'event' OR (e.active AND now() BETWEEN e.starts_at AND e.ends_at))`)).rows;
  for (const m of ms) {
    const inc = metrics[m.metric] || 0;
    if (!inc) continue;
    const pk = await missionPeriodKey(c, m, keys);
    await c.query(`INSERT INTO player_missions(user_id,mission_id,period_key,progress) VALUES ($1,$2,$3,LEAST($4::int,$5::int))
                   ON CONFLICT (user_id,mission_id,period_key) DO UPDATE SET progress = LEAST(player_missions.progress + $4::int, $5::int)`,
      [userId, m.id, pk, inc, m.target]);
  }
  const ach = (await c.query(`SELECT * FROM achievements`)).rows;
  for (const a of ach) {
    const inc = metrics[a.metric] || 0;
    if (!inc) continue;
    await c.query(`INSERT INTO player_achievements(user_id,achievement_id,progress,unlocked_at) VALUES ($1,$2,LEAST($3::int,$4::int), CASE WHEN $3::int >= $4::int THEN now() END)
                   ON CONFLICT (user_id,achievement_id) DO UPDATE SET progress = LEAST(player_achievements.progress + $3::int, $4::int),
                     unlocked_at = COALESCE(player_achievements.unlocked_at, CASE WHEN player_achievements.progress + $3::int >= $4::int THEN now() END)`,
      [userId, a.id, inc, a.target]);
  }
}

export async function bumpLeaderboard(c, userId, points, win) {
  const keys = periodKeys();
  for (const period of ['daily', 'weekly', 'monthly', 'season', 'all']) {
    await c.query(`INSERT INTO leaderboard_entries(user_id,period,period_key,points,wins,games) VALUES ($1,$2,$3,GREATEST($4::int,0),$5::int,1)
                   ON CONFLICT (user_id,period,period_key) DO UPDATE SET points = GREATEST(leaderboard_entries.points + $4::int, 0), wins = leaderboard_entries.wins + $5::int, games = leaderboard_entries.games + 1, updated_at = now()`,
      [userId, period, keys[period], points, win ? 1 : 0]);
  }
}

export async function economySettings(c) {
  return (await c.query(`SELECT value FROM system_settings WHERE key='economy'`)).rows[0]?.value || {};
}
