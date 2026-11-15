// Autentikasi: akun lokal (username+password, scrypt), akun tamu, dan login Supabase (verifikasi JWT HS256).
// Token sesi acak 256-bit; yang disimpan di DB hanya hash SHA-256-nya.
import crypto from 'node:crypto';
import { one, q, tx } from './db/index.js';
import { config } from './config.js';
import { titleFor } from '../../shared/src/index.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const scryptAsync = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(pw, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, s, k] = stored.split('$');
  const key = await scryptAsync(pw, Buffer.from(s, 'base64'));
  const want = Buffer.from(k, 'base64');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function createSession(userId, meta = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  await q(`INSERT INTO sessions(user_id, token_hash, expires_at, ip, user_agent) VALUES ($1,$2, now() + ($3 || ' days')::interval, $4, $5)`,
    [userId, sha(token), String(config.sessionDays), meta.ip || null, (meta.ua || '').slice(0, 200)]);
  await q(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
  return token;
}

export async function revokeSession(token) {
  await q(`UPDATE sessions SET revoked = true WHERE token_hash = $1`, [sha(token)]);
}

export async function userFromToken(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const u = await one(
    `SELECT u.id, u.username, u.auth_provider, u.is_banned, u.ban_reason, u.muted_until, p.display_name, p.level, p.selected_character, a.role AS admin_role
       FROM sessions s JOIN users u ON u.id = s.user_id
       LEFT JOIN player_profiles p ON p.user_id = u.id
       LEFT JOIN admin_users a ON a.user_id = u.id
      WHERE s.token_hash = $1 AND NOT s.revoked AND s.expires_at > now()`, [sha(token)]);
  return u;
}

async function economy(c) {
  const r = await c.query(`SELECT value FROM system_settings WHERE key = 'economy'`);
  return r.rows[0]?.value || { startCoins: 2000, startDiamonds: 30, startTickets: 2 };
}

/** Buat user + profil + dompet + inventaris awal dalam satu transaksi. */
export async function createUser({ username, password, email, provider = 'local', supabaseUid = null, displayName }) {
  const pwHash = password ? await hashPassword(password) : null;
  return tx(async (c) => {
    const exists = await c.query(`SELECT 1 FROM users WHERE lower(username) = lower($1)`, [username]);
    if (exists.rows.length) throw new HttpError(409, 'Username sudah digunakan.');
    if (email) {
      const e = await c.query(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [email]);
      if (e.rows.length) throw new HttpError(409, 'Email sudah terdaftar.');
    }
    const u = (await c.query(`INSERT INTO users(username, email, password_hash, auth_provider, supabase_uid) VALUES ($1,$2,$3,$4,$5) RETURNING id, username`,
      [username, email || null, pwHash, provider, supabaseUid])).rows[0];
    const starters = (await c.query(`SELECT id FROM characters WHERE unlock_type='free' AND active`)).rows.map((r) => r.id);
    const starter = starters.length ? starters[crypto.randomInt(0, starters.length)] : 'bima';
    await c.query(`INSERT INTO player_profiles(user_id, display_name, title, selected_character) VALUES ($1,$2,$3,$4)`, [u.id, (displayName || username).slice(0, 20), titleFor(1), starter]);
    const eco = await economy(c);
    await c.query(`INSERT INTO player_wallets(user_id, coins, diamonds, tickets) VALUES ($1,$2,$3,$4)`, [u.id, eco.startCoins, eco.startDiamonds, eco.startTickets]);
    for (const [cur, amt] of [['coins', eco.startCoins], ['diamonds', eco.startDiamonds], ['tickets', eco.startTickets]]) {
      await c.query(`INSERT INTO wallet_transactions(user_id,currency,amount,balance_after,reason) VALUES ($1,$2,$3,$3,'Bonus pendaftaran')`, [u.id, cur, amt]);
    }
    // item gratis
    const free = [
      ...(await c.query(`SELECT id, 'character' AS kind FROM characters WHERE unlock_type='free'`)).rows,
      ...(await c.query(`SELECT id, kind FROM character_skins WHERE unlock_type='free'`)).rows,
    ];
    for (const it of free) await c.query(`INSERT INTO player_inventory(user_id,item_kind,item_id,source) VALUES ($1,$2,$3,'starter') ON CONFLICT DO NOTHING`, [u.id, it.kind, it.id]);
    await c.query(`INSERT INTO inbox_messages(user_id,kind,title,body) VALUES ($1,'system','Selamat datang, Juragan!','Terima kasih telah bergabung di Monopoli Indonesia. Klaim hadiah login harian setiap hari dan selesaikan misi untuk membuka karakter Nusantara lainnya.')`, [u.id]);
    return u;
  });
}

const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;

export function validateCredentials({ username, password }) {
  if (!USERNAME_RE.test(String(username || ''))) throw new HttpError(400, 'Username 3–20 karakter: huruf, angka, titik, atau garis bawah.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new HttpError(400, 'Password minimal 8 karakter.');
}

export async function login(username, password) {
  const u = await one(`SELECT id, password_hash, is_banned, ban_reason FROM users WHERE lower(username) = lower($1) AND auth_provider = 'local'`, [String(username || '')]);
  // tetap jalankan verifikasi untuk mencegah timing attack enumerasi akun
  const okPw = await verifyPassword(String(password || ''), u?.password_hash || 'scrypt$AAAA$AAAA');
  if (!u || !okPw) throw new HttpError(401, 'Username atau password salah.');
  if (u.is_banned) throw new HttpError(403, `Akun diblokir${u.ban_reason ? `: ${u.ban_reason}` : '.'}`);
  return u.id;
}

export async function guestUser(name) {
  const base = String(name || 'Tamu').replace(/[^A-Za-z0-9_]/g, '').slice(0, 10) || 'Tamu';
  for (let k = 0; k < 5; k++) {
    const username = `${base}_${crypto.randomInt(1000, 99999)}`.slice(0, 20);
    try {
      return await createUser({ username, provider: 'guest', displayName: String(name || 'Tamu').slice(0, 20) });
    } catch (e) { if (e.status !== 409) throw e; }
  }
  throw new HttpError(500, 'Gagal membuat akun tamu.');
}

/** Verifikasi access token Supabase (HS256 dengan JWT secret proyek). */
export function verifySupabaseJwt(token) {
  if (!config.supabaseJwtSecret) throw new HttpError(501, 'Login Supabase belum dikonfigurasi (SUPABASE_JWT_SECRET).');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Token tidak valid.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  if (header.alg !== 'HS256') throw new HttpError(401, 'Algoritma token tidak didukung.');
  const sig = crypto.createHmac('sha256', config.supabaseJwtSecret).update(`${parts[0]}.${parts[1]}`).digest();
  const got = Buffer.from(parts[2], 'base64url');
  if (got.length !== sig.length || !crypto.timingSafeEqual(got, sig)) throw new HttpError(401, 'Tanda tangan token tidak valid.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new HttpError(401, 'Token kedaluwarsa.');
  if (!payload.sub) throw new HttpError(401, 'Token tanpa subjek.');
  return payload;
}

export async function supabaseUser(token) {
  const p = verifySupabaseJwt(token);
  const existing = await one(`SELECT id, is_banned FROM users WHERE supabase_uid = $1`, [p.sub]);
  if (existing) {
    if (existing.is_banned) throw new HttpError(403, 'Akun diblokir.');
    return existing.id;
  }
  const meta = p.user_metadata || {};
  const nameSrc = meta.full_name || meta.name || (p.email || 'pemain').split('@')[0];
  let username = nameSrc.replace(/[^A-Za-z0-9_]/g, '').slice(0, 14) || 'pemain';
  if (username.length < 3) username = `${username}pemain`;
  for (let k = 0; k < 5; k++) {
    try {
      const u = await createUser({ username: k ? `${username}${crypto.randomInt(100, 9999)}` : username, email: p.email, provider: 'supabase', supabaseUid: p.sub, displayName: nameSrc });
      return u.id;
    } catch (e) { if (e.status !== 409) throw e; }
  }
  throw new HttpError(500, 'Gagal membuat akun.');
}

/** Middleware Express: wajib login. */
export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  userFromToken(token).then((u) => {
    if (!u) return res.status(401).json({ error: 'Sesi tidak valid. Silakan masuk kembali.' });
    if (u.is_banned) return res.status(403).json({ error: 'Akun diblokir.' });
    req.user = u; req.token = token;
    next();
  }).catch(next);
}

export const ADMIN_ROLES = ['super_admin', 'admin', 'moderator', 'support'];
/** Middleware RBAC admin. roles = daftar role yang diizinkan. */
export function requireAdmin(...roles) {
  return (req, res, next) => {
    if (!req.user?.admin_role) return res.status(403).json({ error: 'Akses admin diperlukan.' });
    if (roles.length && !roles.includes(req.user.admin_role)) return res.status(403).json({ error: `Role ${req.user.admin_role} tidak memiliki izin untuk aksi ini.` });
    next();
  };
}

export async function ensureSuperAdmin() {
  if (!config.adminUsername || !config.adminPassword) return;
  let u = await one(`SELECT id FROM users WHERE lower(username) = lower($1)`, [config.adminUsername]);
  if (!u) u = await createUser({ username: config.adminUsername, password: config.adminPassword, displayName: 'Super Admin' });
  await q(`INSERT INTO admin_users(user_id, role) VALUES ($1,'super_admin') ON CONFLICT (user_id) DO UPDATE SET role='super_admin'`, [u.id]);
}
