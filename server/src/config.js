// Konfigurasi dari environment variables. Lihat .env.example.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Muat .env sederhana (tanpa dependensi) bila ada
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
export const config = {
  root,
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  databaseUrl: env.DATABASE_URL || '',
  pgliteDir: env.PGLITE_DIR || path.join(root, '.data', 'pglite'),
  allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  sessionDays: Number(env.SESSION_DAYS || 30),
  supabaseUrl: env.SUPABASE_URL || '',
  supabaseAnonKey: env.SUPABASE_ANON_KEY || '',
  supabaseJwtSecret: env.SUPABASE_JWT_SECRET || '',
  adminUsername: env.ADMIN_USERNAME || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  turnSeconds: Number(env.TURN_SECONDS || 45),
  disconnectGraceSec: Number(env.DISCONNECT_GRACE_SEC || 60),
  botDelayMs: Number(env.BOT_DELAY_MS ?? 1100),
  matchmakingWaitSec: Number(env.MATCHMAKING_WAIT_SEC || 12),
  clientDist: path.join(root, 'client', 'dist'),
  authBurst: Number(env.AUTH_BURST || 10), // percobaan login/daftar per IP (isi ulang 1 per 6 detik)
  actionRate: Number(env.ACTION_RATE || 6), // aksi permainan per detik per pemain (burst 2x)
  apiRate: Number(env.API_RATE || 20), // request REST per detik per IP (burst 6x)
  trustProxy: env.TRUST_PROXY === '1',
  paymentProvider: env.PAYMENT_PROVIDER || '', // 'midtrans' | 'xendit' — belum aktif tanpa kredensial
};
export const isProd = config.env === 'production';
